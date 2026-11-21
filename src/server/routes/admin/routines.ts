import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type Db, getDb, schema } from "#/db";
import { PRODUCT_STATUSES, type ProductStatus } from "#/db/schema";
import { routineListSearch } from "#/lib/schemas/routines";
import type { AdminEnv } from "#/server/auth";
import { idParam, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { statusAudit } from "../../domain/audit-actions";
import { pagedRoutines, routineOptions } from "../../domain/catalog-lists";
import { inList } from "../../domain/d1";
import { readSettings } from "../../domain/settings";
import { canMoveStatus } from "../../domain/status";
import {
	localeParam,
	optionalText,
	requiredText,
	seoFields,
	slug,
	translationEntries,
	translations,
} from "./catalog-inputs";

const {
	concerns,
	productTranslations,
	routineItems,
	routines,
	routineTranslations,
	variants,
} = schema;

const routineText = z.object({
	title: requiredText(120),
	description: optionalText(1000),
	...seoFields,
});
const variantIds = z
	.array(z.number().int().positive())
	.max(12)
	.refine((ids) => new Set(ids).size === ids.length, "Duplicate variant");

async function routineDetails(db: Db, ids: number[]) {
	if (ids.length === 0) return [];
	const { defaultLocale } = await readSettings(db);
	const [rows, texts, items] = await Promise.all([
		db
			.select()
			.from(routines)
			.where(inList(routines.id, ids))
			.orderBy(asc(routines.position), asc(routines.id)),
		db
			.select()
			.from(routineTranslations)
			.where(inList(routineTranslations.routineId, ids)),
		db
			.select({
				routineId: routineItems.routineId,
				variantId: routineItems.variantId,
				position: routineItems.position,
				sku: variants.sku,
				variantStatus: variants.status,
				name: productTranslations.name,
			})
			.from(routineItems)
			.innerJoin(variants, eq(variants.id, routineItems.variantId))
			.leftJoin(
				productTranslations,
				and(
					eq(productTranslations.productId, variants.productId),
					eq(productTranslations.locale, defaultLocale),
				),
			)
			.where(inList(routineItems.routineId, ids))
			.orderBy(asc(routineItems.position)),
	]);
	return rows.map((r) => ({
		...r,
		translations: texts.filter((t) => t.routineId === r.id),
		items: items.filter((i) => i.routineId === r.id),
	}));
}

async function concernUnavailable(db: Db, id: number | null | undefined) {
	if (id === null || id === undefined) return false;
	const found = await db.query.concerns.findFirst({
		where: and(eq(concerns.id, id), eq(concerns.status, "active")),
	});
	return !found;
}

async function unavailableVariants(db: Db, ids: number[]) {
	if (ids.length === 0) return false;
	const found = await db
		.select({ id: variants.id })
		.from(variants)
		.where(and(inList(variants.id, ids), eq(variants.status, "active")));
	return found.length !== ids.length;
}

export const routinesRouter = new Hono<AdminEnv>()
	.get("/", validate("query", routineListSearch), async (c) => {
		const db = getDb();
		const { defaultLocale } = await readSettings(db);
		return c.json(await pagedRoutines(db, defaultLocale, c.req.valid("query")));
	})
	.get("/options", async (c) => {
		const db = getDb();
		const { defaultLocale } = await readSettings(db);
		return c.json(await routineOptions(db, defaultLocale));
	})
	.get("/:id", validate("param", idParam), async (c) => {
		const { id } = c.req.valid("param");
		const [routine] = await routineDetails(getDb(), [id]);
		return routine ? c.json(routine) : c.json({ error: "not_found" }, 404);
	})
	.post(
		"/",
		validate(
			"json",
			z.object({
				slug,
				isFeatured: z.boolean().default(false),
				position: z.number().int().min(0).max(1000).default(0),
				concernId: z.number().int().positive().nullable().default(null),
				translations: translations(routineText),
				variantIds: variantIds.default([]),
			}),
		),
		async (c) => {
			const db = getDb();
			const {
				translations: texts,
				variantIds: ids,
				...fields
			} = c.req.valid("json");
			const { defaultLocale } = await readSettings(db);
			if (!texts[defaultLocale])
				return c.json({ error: "publish_requires_default_translation" }, 409);
			const [taken, unavailable, noConcern] = await Promise.all([
				db.query.routines.findFirst({ where: eq(routines.slug, fields.slug) }),
				unavailableVariants(db, ids),
				concernUnavailable(db, fields.concernId),
			]);
			if (taken) return c.json({ error: "duplicate_slug" }, 409);
			if (unavailable) return c.json({ error: "variant_unavailable" }, 409);
			if (noConcern) return c.json({ error: "reference_unavailable" }, 409);
			const routineId = sql<number>`(select id from routines where slug = ${fields.slug})`;
			await db.batch([
				db.insert(routines).values({ ...fields, status: "draft" }),
				...translationEntries(texts).map(([locale, text]) =>
					db.insert(routineTranslations).values({ routineId, locale, ...text }),
				),
				...ids.map((variantId, index) =>
					db
						.insert(routineItems)
						.values({ routineId, variantId, position: index + 1 }),
				),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "routine.create",
					entityType: "routine",
					entityId: routineId,
					data: { ...fields, translations: texts, variantIds: ids },
				}),
			]);
			const created = await db.query.routines.findFirst({
				where: eq(routines.slug, fields.slug),
			});
			if (!created) throw new Error(`Routine ${fields.slug} missing`);
			const [routine] = await routineDetails(db, [created.id]);
			if (!routine) throw new Error(`Routine ${created.id} missing`);
			return c.json(routine, 201);
		},
	)
	.patch(
		"/:id",
		validate("param", idParam),
		validate(
			"json",
			z
				.object({
					slug,
					isFeatured: z.boolean(),
					position: z.number().int().min(0).max(1000),
					concernId: z.number().int().positive().nullable(),
					status: z.enum(PRODUCT_STATUSES),
				})
				.partial()
				.refine((v) => Object.keys(v).length > 0, "Nothing to change"),
		),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const patch = c.req.valid("json");
			const stored = await db.query.routines.findFirst({
				where: eq(routines.id, id),
			});
			if (!stored) return c.json({ error: "not_found" }, 404);
			if (patch.slug && patch.slug !== stored.slug) {
				if (stored.status === "published")
					return c.json({ error: "slug_locked" }, 409);
				const taken = await db.query.routines.findFirst({
					where: eq(routines.slug, patch.slug),
				});
				if (taken) return c.json({ error: "duplicate_slug" }, 409);
			}
			if (await concernUnavailable(db, patch.concernId))
				return c.json({ error: "reference_unavailable" }, 409);
			const moving = patch.status && patch.status !== stored.status;
			if (
				moving &&
				!canMoveStatus(stored.status, patch.status as ProductStatus)
			)
				return c.json({ error: "invalid_transition" }, 409);
			if (moving && patch.status === "published") {
				const { defaultLocale } = await readSettings(db);
				const [ready] = await db
					.select({
						items: sql<number>`(select count(*) from ${routineItems} where ${routineItems.routineId} = ${id})`,
						translated: sql<number>`(select count(*) from ${routineTranslations} where ${routineTranslations.routineId} = ${id} and ${routineTranslations.locale} = ${defaultLocale})`,
					})
					.from(routines)
					.where(eq(routines.id, id));
				if (!ready) throw new Error(`Routine ${id} missing`);
				if (!ready.translated)
					return c.json({ error: "publish_requires_default_translation" }, 409);
				if (!ready.items)
					return c.json({ error: "routine_requires_items" }, 409);
			}
			// Applies only while the routine is in the status that was read.
			const unchanged = and(
				eq(routines.id, id),
				eq(routines.status, stored.status),
			);
			const [, [row]] = await db.batch([
				audit(
					db,
					{
						actorUserId: c.var.adminUserId,
						...statusAudit("routine", id, stored.status, patch.status, {
							before: stored,
							patch,
						}),
					},
					db.select({ id: routines.id }).from(routines).where(unchanged),
				),
				db.update(routines).set(patch).where(unchanged).returning(),
			]);
			if (!row) return c.json({ error: "invalid_transition" }, 409);
			return c.json(row);
		},
	)
	.put(
		"/:id/translations/:locale",
		validate("param", localeParam),
		validate("json", routineText),
		async (c) => {
			const db = getDb();
			const { id, locale } = c.req.valid("param");
			const text = c.req.valid("json");
			const routine = await db.query.routines.findFirst({
				where: eq(routines.id, id),
			});
			if (!routine) return c.json({ error: "not_found" }, 404);
			const [[row]] = await db.batch([
				db
					.insert(routineTranslations)
					.values({ routineId: id, locale, ...text })
					.onConflictDoUpdate({
						target: [routineTranslations.routineId, routineTranslations.locale],
						set: text,
					})
					.returning(),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "routine.update",
					entityType: "routine",
					entityId: id,
					data: { translation: locale, ...text },
				}),
			]);
			return c.json(row);
		},
	)
	.put(
		"/:id/items",
		validate("param", idParam),
		validate("json", z.object({ variantIds })),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { variantIds: ids } = c.req.valid("json");
			const routine = await db.query.routines.findFirst({
				where: eq(routines.id, id),
			});
			if (!routine) return c.json({ error: "not_found" }, 404);
			if (routine.status === "published" && ids.length === 0)
				return c.json({ error: "routine_requires_items" }, 409);
			if (await unavailableVariants(db, ids))
				return c.json({ error: "variant_unavailable" }, 409);
			await db.batch([
				db.delete(routineItems).where(eq(routineItems.routineId, id)),
				...ids.map((variantId, index) =>
					db
						.insert(routineItems)
						.values({ routineId: id, variantId, position: index + 1 }),
				),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "routine.update",
					entityType: "routine",
					entityId: id,
					data: { items: ids },
				}),
			]);
			const [updated] = await routineDetails(db, [id]);
			if (!updated) throw new Error(`Routine ${id} missing`);
			return c.json(updated);
		},
	);
