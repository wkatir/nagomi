import { and, eq, notExists, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "#/db";
import { ARCHIVABLE_STATUSES } from "#/db/schema";
import { CATEGORY_ICONS } from "#/lib/enums";
import { categoryListSearch } from "#/lib/schemas/categories";
import type { AdminEnv } from "#/server/auth";
import { idParam, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { statusAudit } from "../../domain/audit-actions";
import { categoryOptions, pagedCategories } from "../../domain/catalog-lists";
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

const { categories, categoryTranslations, products } = schema;

const categoryText = z.object({
	name: requiredText(80),
	subtitle: optionalText(80).optional(),
	description: optionalText(1000).optional(),
	...seoFields,
});
const categoryFields = z.object({
	slug,
	// Orders the catalogue.
	sortOrder: z.number().int().min(0).max(1000),
	icon: z.enum(CATEGORY_ICONS),
	status: z.enum(ARCHIVABLE_STATUSES),
});

async function withTranslations<T extends { id: number }>(rows: T[]) {
	if (rows.length === 0) return [];
	const texts = await getDb()
		.select()
		.from(categoryTranslations)
		.where(
			inList(
				categoryTranslations.categoryId,
				rows.map((r) => r.id),
			),
		);
	return rows.map((r) => ({
		...r,
		translations: texts.filter((t) => t.categoryId === r.id),
	}));
}

export const categoriesRouter = new Hono<AdminEnv>()
	.get("/", validate("query", categoryListSearch), async (c) => {
		const db = getDb();
		const { defaultLocale } = await readSettings(db);
		return c.json(
			await pagedCategories(db, defaultLocale, c.req.valid("query")),
		);
	})
	.get("/options", async (c) => {
		const db = getDb();
		const { defaultLocale } = await readSettings(db);
		return c.json(await categoryOptions(db, defaultLocale));
	})
	.get("/:id", validate("param", idParam), async (c) => {
		const { id } = c.req.valid("param");
		const row = await getDb().query.categories.findFirst({
			where: eq(categories.id, id),
		});
		if (!row) return c.json({ error: "not_found" }, 404);
		const [category] = await withTranslations([row]);
		return c.json(category);
	})
	.post(
		"/",
		validate(
			"json",
			categoryFields
				.omit({ status: true })
				.partial({ sortOrder: true })
				.extend({ translations: translations(categoryText) }),
		),
		async (c) => {
			const db = getDb();
			const { translations: texts, ...fields } = c.req.valid("json");
			const { defaultLocale } = await readSettings(db);
			if (!texts[defaultLocale])
				return c.json({ error: "publish_requires_default_translation" }, 409);
			const exists = await db.query.categories.findFirst({
				where: eq(categories.slug, fields.slug),
			});
			if (exists) return c.json({ error: "duplicate_slug" }, 409);
			const categoryId = sql<number>`(select id from categories where slug = ${fields.slug})`;
			await db.batch([
				db.insert(categories).values(fields),
				...translationEntries(texts).map(([locale, text]) =>
					db
						.insert(categoryTranslations)
						.values({ categoryId, locale, ...text }),
				),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "category.create",
					entityType: "category",
					entityId: categoryId,
					data: { ...fields, translations: texts },
				}),
			]);
			const created = await db.query.categories.findFirst({
				where: eq(categories.slug, fields.slug),
			});
			if (!created) throw new Error(`Category ${fields.slug} missing`);
			const [category] = await withTranslations([created]);
			return c.json(category, 201);
		},
	)
	.patch(
		"/:id",
		validate("param", idParam),
		validate(
			"json",
			categoryFields
				.partial()
				.refine((v) => Object.keys(v).length > 0, "Nothing to change"),
		),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const patch = c.req.valid("json");
			const stored = await db.query.categories.findFirst({
				where: eq(categories.id, id),
			});
			if (!stored) return c.json({ error: "not_found" }, 404);
			// The storefront names every active category in the default locale.
			if (patch.status === "active" && stored.status !== "active") {
				const { defaultLocale } = await readSettings(db);
				const named = await db.query.categoryTranslations.findFirst({
					where: and(
						eq(categoryTranslations.categoryId, id),
						eq(categoryTranslations.locale, defaultLocale),
					),
				});
				if (!named)
					return c.json({ error: "publish_requires_default_translation" }, 409);
			}
			if (patch.slug && patch.slug !== stored.slug) {
				const taken = await db.query.categories.findFirst({
					where: eq(categories.slug, patch.slug),
				});
				if (taken) return c.json({ error: "duplicate_slug" }, 409);
			}
			const target = and(
				eq(categories.id, id),
				patch.status === "archived"
					? notExists(
							db
								.select({ id: products.id })
								.from(products)
								.where(
									and(
										eq(products.categoryId, id),
										eq(products.status, "published"),
									),
								),
						)
					: undefined,
			);
			const [[row]] = await db.batch([
				db.update(categories).set(patch).where(target).returning(),
				audit(
					db,
					{
						actorUserId: c.var.adminUserId,
						...statusAudit("category", id, stored.status, patch.status, {
							before: stored,
							patch,
						}),
					},
					db.select({ id: categories.id }).from(categories).where(target),
				),
			]);
			if (!row) return c.json({ error: "in_use" }, 409);
			return c.json(row);
		},
	)
	.put(
		"/:id/translations/:locale",
		validate("param", localeParam),
		validate("json", categoryText),
		async (c) => {
			const db = getDb();
			const { id, locale } = c.req.valid("param");
			const text = c.req.valid("json");
			const category = await db.query.categories.findFirst({
				where: eq(categories.id, id),
			});
			if (!category) return c.json({ error: "not_found" }, 404);
			const [[row]] = await db.batch([
				db
					.insert(categoryTranslations)
					.values({ categoryId: id, locale, ...text })
					.onConflictDoUpdate({
						target: [
							categoryTranslations.categoryId,
							categoryTranslations.locale,
						],
						set: text,
					})
					.returning(),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "category.update",
					entityType: "category",
					entityId: id,
					data: { translation: locale, ...text },
				}),
			]);
			return c.json(row);
		},
	);
