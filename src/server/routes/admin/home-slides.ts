import { and, asc, eq, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type Db, getDb, schema } from "#/db";
import { now, PRODUCT_STATUSES, type ProductStatus } from "#/db/schema";
import { calendarDate } from "#/lib/schemas/dates";
import { isStorePath } from "#/lib/store-path";
import type { AdminEnv } from "#/server/auth";
import { idParam, invalidRequest, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { statusAudit } from "../../domain/audit-actions";
import { inList, nonEmpty } from "../../domain/d1";
import { mediaUrl } from "../../domain/images";
import { readSettings } from "../../domain/settings";
import { canMoveStatus } from "../../domain/status";
import {
	optionalText,
	requiredText,
	translationEntries,
	translations,
} from "./catalog-inputs";

const { homeSlides, homeSlideTranslations, mediaFiles } = schema;

const slideText = z.object({
	title: requiredText(120),
	body: optionalText(300).optional(),
	ctaLabel: optionalText(40).optional(),
	imageAlt: requiredText(250),
});
const fullText = (text: z.infer<typeof slideText>) => ({
	body: null,
	ctaLabel: null,
	...text,
});
const slideFields = z.object({
	position: z.number().int().min(0).max(1000),
	desktopMediaId: z.number().int().positive(),
	mobileMediaId: z.number().int().positive().nullable(),
	linkPath: z
		.string()
		.trim()
		.refine(
			isStorePath,
			"A storefront path without the locale prefix, e.g. /products?category=teclados",
		),
	// Local days of the store, both included; null leaves that side open.
	startsOn: calendarDate.nullable(),
	endsOn: calendarDate.nullable(),
});
const slideState = z
	.object({ startsOn: z.string().nullable(), endsOn: z.string().nullable() })
	.refine((s) => !s.startsOn || !s.endsOn || s.startsOn <= s.endsOn, {
		message: "endsOn is before startsOn",
		path: ["endsOn"],
	});

const mediaView = (file: typeof mediaFiles.$inferSelect | undefined) =>
	file ? { ...file, url: mediaUrl(file.r2Key) } : null;

async function slideDetails(db: Db, ids: number[]) {
	if (ids.length === 0) return [];
	// Batched selects need unique column names (see loadCatalog): images are read apart.
	const [rows, images, texts] = await db.batch([
		db
			.select()
			.from(homeSlides)
			.where(inList(homeSlides.id, ids))
			.orderBy(asc(homeSlides.position), asc(homeSlides.id)),
		db
			.select()
			.from(mediaFiles)
			.where(
				sql`${mediaFiles.id} in (select desktop_media_id from ${homeSlides} where ${inList(sql`id`, ids)} union select mobile_media_id from ${homeSlides} where ${inList(sql`id`, ids)})`,
			),
		db
			.select()
			.from(homeSlideTranslations)
			.where(inList(homeSlideTranslations.slideId, ids)),
	]);
	const image = (id: number | null) =>
		mediaView(images.find((m) => m.id === id));
	return rows.map((slide) => ({
		...slide,
		desktopImage: image(slide.desktopMediaId),
		mobileImage: image(slide.mobileMediaId),
		translations: texts.filter((t) => t.slideId === slide.id),
	}));
}

async function mediaAvailable(db: Db, ids: (number | null | undefined)[]) {
	const wanted = [
		...new Set(ids.filter((id): id is number => typeof id === "number")),
	];
	if (wanted.length === 0) return true;
	const found = await db
		.select({ id: mediaFiles.id })
		.from(mediaFiles)
		.where(inList(mediaFiles.id, wanted));
	return found.length === wanted.length;
}

export const homeSlidesRouter = new Hono<AdminEnv>()
	.get(
		"/",
		validate(
			"query",
			z.object({ status: z.enum(PRODUCT_STATUSES).optional() }),
		),
		async (c) => {
			const db = getDb();
			const { status } = c.req.valid("query");
			const rows = await db
				.select({ id: homeSlides.id })
				.from(homeSlides)
				.where(status ? eq(homeSlides.status, status) : undefined);
			return c.json(
				await slideDetails(
					db,
					rows.map((r) => r.id),
				),
			);
		},
	)
	.get("/:id", validate("param", idParam), async (c) => {
		const { id } = c.req.valid("param");
		const [slide] = await slideDetails(getDb(), [id]);
		return slide ? c.json(slide) : c.json({ error: "not_found" }, 404);
	})
	.post(
		"/",
		validate(
			"json",
			slideFields
				.partial({
					position: true,
					mobileMediaId: true,
					startsOn: true,
					endsOn: true,
				})
				.extend({ translations: translations(slideText) }),
		),
		async (c) => {
			const db = getDb();
			const { translations: texts, ...fields } = c.req.valid("json");
			const state = slideState.safeParse({
				startsOn: fields.startsOn ?? null,
				endsOn: fields.endsOn ?? null,
			});
			if (!state.success) return invalidRequest(c, state.error);
			const { defaultLocale } = await readSettings(db);
			if (!texts[defaultLocale])
				return c.json({ error: "publish_requires_default_translation" }, 409);
			if (
				!(await mediaAvailable(db, [
					fields.desktopMediaId,
					fields.mobileMediaId,
				]))
			)
				return c.json({ error: "reference_unavailable" }, 409);
			const [[created]] = await db.batch([
				db
					.insert(homeSlides)
					.values({ ...fields, status: "draft" })
					.returning({ id: homeSlides.id }),
				...translationEntries(texts).map(([locale, text]) =>
					db.insert(homeSlideTranslations).values({
						slideId: sql<number>`(select max(id) from home_slides)`,
						locale,
						...fullText(text),
					}),
				),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "home_slide.create",
					entityType: "home_slide",
					entityId: sql<number>`(select max(id) from home_slides)`,
					data: { ...fields, translations: texts },
				}),
			]);
			if (!created) throw new Error("Home slide missing after insert");
			const [slide] = await slideDetails(db, [created.id]);
			return c.json(slide, 201);
		},
	)
	.patch(
		"/:id",
		validate("param", idParam),
		validate(
			"json",
			slideFields
				.extend({ status: z.enum(PRODUCT_STATUSES) })
				.partial()
				.refine((v) => Object.keys(v).length > 0, "Nothing to change"),
		),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const patch = c.req.valid("json");
			const stored = await db.query.homeSlides.findFirst({
				where: eq(homeSlides.id, id),
			});
			if (!stored) return c.json({ error: "not_found" }, 404);
			const state = slideState.safeParse({ ...stored, ...patch });
			if (!state.success) return invalidRequest(c, state.error);
			if (
				!(await mediaAvailable(db, [patch.desktopMediaId, patch.mobileMediaId]))
			)
				return c.json({ error: "reference_unavailable" }, 409);
			const moving =
				patch.status !== undefined && patch.status !== stored.status;
			if (
				moving &&
				!canMoveStatus(stored.status, patch.status as ProductStatus)
			)
				return c.json({ error: "invalid_transition" }, 409);
			const publishing = moving && patch.status === "published";
			const { defaultLocale } = await readSettings(db);
			const translated = sql`exists (select 1 from ${homeSlideTranslations} t where t.slide_id = ${id} and t.locale = ${defaultLocale})`;
			if (publishing) {
				const text = await db.query.homeSlideTranslations.findFirst({
					where: and(
						eq(homeSlideTranslations.slideId, id),
						eq(homeSlideTranslations.locale, defaultLocale),
					),
				});
				if (!text)
					return c.json({ error: "publish_requires_default_translation" }, 409);
			}
			const unchanged = and(
				eq(homeSlides.id, id),
				eq(homeSlides.status, stored.status),
				publishing ? translated : undefined,
			);
			const [, [row]] = await db.batch([
				audit(
					db,
					{
						actorUserId: c.var.adminUserId,
						...statusAudit("home_slide", id, stored.status, patch.status, {
							before: stored,
							patch,
						}),
					},
					db.select({ id: homeSlides.id }).from(homeSlides).where(unchanged),
				),
				db
					.update(homeSlides)
					.set({ ...patch, updatedAt: now })
					.where(unchanged)
					.returning(),
			]);
			if (!row) return c.json({ error: "invalid_transition" }, 409);
			const [slide] = await slideDetails(db, [id]);
			return c.json(slide);
		},
	)
	.put(
		"/:id/translations",
		validate("param", idParam),
		validate("json", z.object({ translations: translations(slideText) })),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { translations: texts } = c.req.valid("json");
			const slide = await db.query.homeSlides.findFirst({
				where: eq(homeSlides.id, id),
			});
			if (!slide) return c.json({ error: "not_found" }, 404);
			await db.batch([
				db
					.update(homeSlides)
					.set({ updatedAt: now })
					.where(eq(homeSlides.id, id)),
				...translationEntries(texts).map(([locale, text]) => {
					const full = fullText(text);
					return db
						.insert(homeSlideTranslations)
						.values({ slideId: id, locale, ...full })
						.onConflictDoUpdate({
							target: [
								homeSlideTranslations.slideId,
								homeSlideTranslations.locale,
							],
							set: full,
						});
				}),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "home_slide.update",
					entityType: "home_slide",
					entityId: id,
					data: { translations: texts },
				}),
			]);
			const [updated] = await slideDetails(db, [id]);
			if (!updated) throw new Error(`Home slide ${id} missing after update`);
			return c.json(updated);
		},
	)
	.put(
		"/order",
		validate(
			"json",
			z.object({
				slideIds: z
					.array(z.number().int().positive())
					.min(1)
					.max(100)
					.refine((ids) => new Set(ids).size === ids.length, "Duplicate"),
			}),
		),
		async (c) => {
			const db = getDb();
			const { slideIds: ids } = c.req.valid("json");
			const current = await db
				.select({ id: homeSlides.id })
				.from(homeSlides)
				.where(ne(homeSlides.status, "archived"));
			if (
				current.length !== ids.length ||
				current.some((x) => !ids.includes(x.id))
			)
				return c.json({ error: "slides_changed" }, 409);
			const sameSet = sql`(select count(*) from ${homeSlides} x where x.status <> 'archived') = ${ids.length} and not exists (select 1 from ${homeSlides} x where x.status <> 'archived' and not ${inList(sql`x.id`, ids)})`;
			const results = await db.batch(
				nonEmpty(
					ids.flatMap((slideId, index) => {
						const target = and(eq(homeSlides.id, slideId), sameSet);
						return [
							audit(
								db,
								{
									actorUserId: c.var.adminUserId,
									action: "home_slide.update",
									entityType: "home_slide",
									entityId: slideId,
									data: { position: index, order: ids },
								},
								db.select({ id: homeSlides.id }).from(homeSlides).where(target),
							),
							db.update(homeSlides).set({ position: index }).where(target),
						];
					}),
				),
			);
			if (!results[results.length - 1].meta.changes)
				return c.json({ error: "slides_changed" }, 409);
			return c.json(
				await db
					.select({ id: homeSlides.id, position: homeSlides.position })
					.from(homeSlides)
					.where(inList(homeSlides.id, ids))
					.orderBy(asc(homeSlides.position)),
			);
		},
	);
