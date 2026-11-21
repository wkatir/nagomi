import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "#/db";
import { ARCHIVABLE_STATUSES } from "#/db/schema";
import { concernListSearch } from "#/lib/schemas/concerns";
import type { AdminEnv } from "#/server/auth";
import { idParam, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { statusAudit } from "../../domain/audit-actions";
import { concernOptions, pagedConcerns } from "../../domain/catalog-lists";
import { inList } from "../../domain/d1";
import { readSettings } from "../../domain/settings";
import {
	localeParam,
	optionalText,
	requiredText,
	seoFields,
	slug,
	translationEntries,
	translations,
} from "./catalog-inputs";

const { concerns, concernTranslations } = schema;

const concernText = z.object({
	name: requiredText(80),
	description: optionalText(1000).optional(),
	...seoFields,
});
const concernFields = z.object({
	slug,
	position: z.number().int().min(0).max(1000),
	status: z.enum(ARCHIVABLE_STATUSES),
});

async function withTranslations<T extends { id: number }>(rows: T[]) {
	if (rows.length === 0) return [];
	const texts = await getDb()
		.select()
		.from(concernTranslations)
		.where(
			inList(
				concernTranslations.concernId,
				rows.map((r) => r.id),
			),
		);
	return rows.map((r) => ({
		...r,
		translations: texts.filter((t) => t.concernId === r.id),
	}));
}

// An archived concern leaves the storefront; its products keep the link.
export const concernsRouter = new Hono<AdminEnv>()
	.get("/", validate("query", concernListSearch), async (c) => {
		const db = getDb();
		const { defaultLocale } = await readSettings(db);
		return c.json(await pagedConcerns(db, defaultLocale, c.req.valid("query")));
	})
	.get("/options", async (c) => {
		const db = getDb();
		const { defaultLocale } = await readSettings(db);
		return c.json(await concernOptions(db, defaultLocale));
	})
	.get("/:id", validate("param", idParam), async (c) => {
		const { id } = c.req.valid("param");
		const row = await getDb().query.concerns.findFirst({
			where: eq(concerns.id, id),
		});
		if (!row) return c.json({ error: "not_found" }, 404);
		const [concern] = await withTranslations([row]);
		return c.json(concern);
	})
	.post(
		"/",
		validate(
			"json",
			concernFields.omit({ status: true }).extend({
				position: concernFields.shape.position.default(0),
				translations: translations(concernText),
			}),
		),
		async (c) => {
			const db = getDb();
			const { translations: texts, ...fields } = c.req.valid("json");
			const { defaultLocale } = await readSettings(db);
			if (!texts[defaultLocale])
				return c.json({ error: "publish_requires_default_translation" }, 409);
			const exists = await db.query.concerns.findFirst({
				where: eq(concerns.slug, fields.slug),
			});
			if (exists) return c.json({ error: "duplicate_slug" }, 409);
			const concernId = sql<number>`(select id from concerns where slug = ${fields.slug})`;
			await db.batch([
				db.insert(concerns).values(fields),
				...translationEntries(texts).map(([locale, text]) =>
					db.insert(concernTranslations).values({ concernId, locale, ...text }),
				),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "concern.create",
					entityType: "concern",
					entityId: concernId,
					data: { ...fields, translations: texts },
				}),
			]);
			const created = await db.query.concerns.findFirst({
				where: eq(concerns.slug, fields.slug),
			});
			if (!created) throw new Error(`Concern ${fields.slug} missing`);
			const [concern] = await withTranslations([created]);
			return c.json(concern, 201);
		},
	)
	.patch(
		"/:id",
		validate("param", idParam),
		validate(
			"json",
			concernFields
				.partial()
				.refine((v) => Object.keys(v).length > 0, "Nothing to change"),
		),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const patch = c.req.valid("json");
			const stored = await db.query.concerns.findFirst({
				where: eq(concerns.id, id),
			});
			if (!stored) return c.json({ error: "not_found" }, 404);
			// The storefront names every active concern in the default locale.
			if (patch.status === "active" && stored.status !== "active") {
				const { defaultLocale } = await readSettings(db);
				const named = await db.query.concernTranslations.findFirst({
					where: and(
						eq(concernTranslations.concernId, id),
						eq(concernTranslations.locale, defaultLocale),
					),
				});
				if (!named)
					return c.json({ error: "publish_requires_default_translation" }, 409);
			}
			if (patch.slug && patch.slug !== stored.slug) {
				const taken = await db.query.concerns.findFirst({
					where: eq(concerns.slug, patch.slug),
				});
				if (taken) return c.json({ error: "duplicate_slug" }, 409);
			}
			const [[row]] = await db.batch([
				db.update(concerns).set(patch).where(eq(concerns.id, id)).returning(),
				audit(db, {
					actorUserId: c.var.adminUserId,
					...statusAudit("concern", id, stored.status, patch.status, {
						before: stored,
						patch,
					}),
				}),
			]);
			return c.json(row);
		},
	)
	.put(
		"/:id/translations/:locale",
		validate("param", localeParam),
		validate("json", concernText),
		async (c) => {
			const db = getDb();
			const { id, locale } = c.req.valid("param");
			const text = c.req.valid("json");
			const concern = await db.query.concerns.findFirst({
				where: eq(concerns.id, id),
			});
			if (!concern) return c.json({ error: "not_found" }, 404);
			const [[row]] = await db.batch([
				db
					.insert(concernTranslations)
					.values({ concernId: id, locale, ...text })
					.onConflictDoUpdate({
						target: [concernTranslations.concernId, concernTranslations.locale],
						set: text,
					})
					.returning(),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "concern.update",
					entityType: "concern",
					entityId: id,
					data: { translation: locale, ...text },
				}),
			]);
			return c.json(row);
		},
	);
