import { and, eq, notExists, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "#/db";
import { ARCHIVABLE_STATUSES } from "#/db/schema";
import { brandListSearch } from "#/lib/schemas/brands";
import type { AdminEnv } from "#/server/auth";
import { idParam, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { statusAudit } from "../../domain/audit-actions";
import { brandOptions, pagedBrands } from "../../domain/catalog-lists";
import { searchKey, withoutSearchKey } from "../../domain/search";
import {
	localeParam,
	optionalText,
	requiredText,
	seoFields,
	slug,
} from "./catalog-inputs";

const { brands, brandTranslations, products } = schema;

const brandText = z.object({
	description: optionalText(2000).optional(),
	...seoFields,
});

const brandFields = z.object({
	slug,
	name: requiredText(80),
	countryCode: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z]{2}$/)
		.nullable(),
});

export const brandsRouter = new Hono<AdminEnv>()
	.get("/", validate("query", brandListSearch), async (c) =>
		c.json(await pagedBrands(getDb(), c.req.valid("query"))),
	)
	.get("/options", async (c) => c.json(await brandOptions(getDb())))
	.get("/:id", validate("param", idParam), async (c) => {
		const db = getDb();
		const { id } = c.req.valid("param");
		const [[brand], texts] = await db.batch([
			db.select().from(brands).where(eq(brands.id, id)),
			db
				.select()
				.from(brandTranslations)
				.where(eq(brandTranslations.brandId, id)),
		]);
		if (!brand) return c.json({ error: "not_found" }, 404);
		return c.json({ ...withoutSearchKey(brand), translations: texts });
	})
	.post(
		"/",
		validate("json", brandFields.partial({ countryCode: true })),
		async (c) => {
			const db = getDb();
			const input = c.req.valid("json");
			const exists = await db.query.brands.findFirst({
				where: eq(brands.slug, input.slug),
			});
			if (exists) return c.json({ error: "duplicate_slug" }, 409);
			const brandId = sql<number>`(select id from brands where slug = ${input.slug})`;
			const [[row]] = await db.batch([
				db
					.insert(brands)
					.values({ ...input, searchKey: searchKey(input.name, input.slug) })
					.returning(),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "brand.create",
					entityType: "brand",
					entityId: brandId,
					data: input,
				}),
			]);
			return c.json(withoutSearchKey(row), 201);
		},
	)
	.patch(
		"/:id",
		validate("param", idParam),
		validate(
			"json",
			brandFields
				.extend({ status: z.enum(ARCHIVABLE_STATUSES) })
				.partial()
				.refine((v) => Object.keys(v).length > 0, "Nothing to change"),
		),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const patch = c.req.valid("json");
			const stored = await db.query.brands.findFirst({
				where: eq(brands.id, id),
			});
			if (!stored) return c.json({ error: "not_found" }, 404);
			if (patch.slug && patch.slug !== stored.slug) {
				const taken = await db.query.brands.findFirst({
					where: eq(brands.slug, patch.slug),
				});
				if (taken) return c.json({ error: "duplicate_slug" }, 409);
			}
			const target = and(
				eq(brands.id, id),
				patch.status === "archived"
					? notExists(
							db
								.select({ id: products.id })
								.from(products)
								.where(
									and(
										eq(products.brandId, id),
										eq(products.status, "published"),
									),
								),
						)
					: undefined,
			);
			const [rows] = await db.batch([
				db
					.update(brands)
					.set({
						...patch,
						...(patch.name !== undefined || patch.slug !== undefined
							? {
									searchKey: searchKey(
										patch.name ?? stored.name,
										patch.slug ?? stored.slug,
									),
								}
							: {}),
					})
					.where(target)
					.returning(),
				audit(
					db,
					{
						actorUserId: c.var.adminUserId,
						...statusAudit("brand", id, stored.status, patch.status, {
							before: stored,
							patch,
						}),
					},
					db.select({ id: brands.id }).from(brands).where(target),
				),
			]);
			const [row] = rows;
			if (!row) return c.json({ error: "in_use" }, 409);
			return c.json(withoutSearchKey(row));
		},
	)
	.put(
		"/:id/translations/:locale",
		validate("param", localeParam),
		validate("json", brandText),
		async (c) => {
			const db = getDb();
			const { id, locale } = c.req.valid("param");
			const text = {
				description: null,
				seoTitle: null,
				seoDescription: null,
				...c.req.valid("json"),
			};
			const brand = await db.query.brands.findFirst({
				where: eq(brands.id, id),
			});
			if (!brand) return c.json({ error: "not_found" }, 404);
			const [[row]] = await db.batch([
				db
					.insert(brandTranslations)
					.values({ brandId: id, locale, ...text })
					.onConflictDoUpdate({
						target: [brandTranslations.brandId, brandTranslations.locale],
						set: text,
					})
					.returning(),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "brand.update",
					entityType: "brand",
					entityId: id,
					data: { translation: locale, ...text },
				}),
			]);
			return c.json(row);
		},
	);
