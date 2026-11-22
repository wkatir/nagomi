import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type Db, getDb, schema } from "#/db";
import { now, PRODUCT_STATUSES, type ProductStatus } from "#/db/schema";
import {
	BUNDLE_MAX_ITEMS,
	BUNDLE_MIN_ITEMS,
	bundleListSearch,
} from "#/lib/schemas/bundles";
import type { AdminEnv } from "#/server/auth";
import { idParam, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { statusAudit } from "../../domain/audit-actions";
import { bundleRefusal } from "../../domain/bundles";
import { bundleOptions, pagedBundles } from "../../domain/catalog-lists";
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
	bundleItems,
	bundles,
	bundleTranslations,
	productTranslations,
	variants,
} = schema;

const bundleText = z.object({
	name: requiredText(120),
	description: optionalText(1000).optional(),
	...seoFields,
});
const price = z.number().int().min(1).max(100_000_000);
const items = z
	.array(
		z.object({
			variantId: z.number().int().positive(),
			quantity: z.number().int().min(1).max(99),
		}),
	)
	.max(BUNDLE_MAX_ITEMS)
	.refine(
		(list) => new Set(list.map((i) => i.variantId)).size === list.length,
		"Duplicate variant",
	);
type Items = z.infer<typeof items>;

async function bundleDetails(db: Db, ids: number[]) {
	if (ids.length === 0) return [];
	const { defaultLocale } = await readSettings(db);
	const [rows, texts, lines] = await Promise.all([
		db
			.select()
			.from(bundles)
			.where(inList(bundles.id, ids))
			.orderBy(asc(bundles.position), asc(bundles.id)),
		db
			.select()
			.from(bundleTranslations)
			.where(inList(bundleTranslations.bundleId, ids)),
		db
			.select({
				bundleId: bundleItems.bundleId,
				variantId: bundleItems.variantId,
				quantity: bundleItems.quantity,
				position: bundleItems.position,
				sku: variants.sku,
				variantStatus: variants.status,
				price: variants.price,
				name: productTranslations.name,
			})
			.from(bundleItems)
			.innerJoin(variants, eq(variants.id, bundleItems.variantId))
			.leftJoin(
				productTranslations,
				and(
					eq(productTranslations.productId, variants.productId),
					eq(productTranslations.locale, defaultLocale),
				),
			)
			.where(inList(bundleItems.bundleId, ids))
			.orderBy(asc(bundleItems.position)),
	]);
	return rows.map((r) => {
		const own = lines.filter((i) => i.bundleId === r.id);
		const unpriced = own.some((i) => i.price === null);
		const itemsTotal = unpriced
			? null
			: own.reduce((n, i) => n + i.quantity * (i.price as number), 0);
		return {
			...r,
			translations: texts.filter((t) => t.bundleId === r.id),
			items: own,
			itemsTotal,
			saving: itemsTotal === null ? null : itemsTotal - r.price,
		};
	});
}

async function refusalFor(db: Db, list: Items, bundlePrice: number) {
	const ids = list.map((i) => i.variantId);
	const found =
		ids.length === 0
			? []
			: await db
					.select({
						id: variants.id,
						status: variants.status,
						price: variants.price,
					})
					.from(variants)
					.where(inList(variants.id, ids));
	return bundleRefusal(
		list.map((i) => {
			const variant = found.find((v) => v.id === i.variantId);
			return {
				variantId: i.variantId,
				quantity: i.quantity,
				price: variant?.status === "active" ? variant.price : null,
			};
		}),
		bundlePrice,
	);
}

function storedItems(db: Db, id: number): Promise<Items> {
	return db
		.select({
			variantId: bundleItems.variantId,
			quantity: bundleItems.quantity,
		})
		.from(bundleItems)
		.where(eq(bundleItems.bundleId, id))
		.orderBy(asc(bundleItems.position));
}

async function written(db: Db, id: number) {
	const [bundle] = await bundleDetails(db, [id]);
	if (!bundle) throw new Error(`Bundle ${id} missing`);
	return bundle;
}

export const bundlesRouter = new Hono<AdminEnv>()
	.get("/", validate("query", bundleListSearch), async (c) => {
		const db = getDb();
		const { defaultLocale } = await readSettings(db);
		return c.json(await pagedBundles(db, defaultLocale, c.req.valid("query")));
	})
	.get("/options", async (c) => {
		const db = getDb();
		const { defaultLocale } = await readSettings(db);
		return c.json(await bundleOptions(db, defaultLocale));
	})
	.get("/:id", validate("param", idParam), async (c) => {
		const { id } = c.req.valid("param");
		const [bundle] = await bundleDetails(getDb(), [id]);
		return bundle ? c.json(bundle) : c.json({ error: "not_found" }, 404);
	})
	.post(
		"/",
		validate(
			"json",
			z.object({
				slug,
				price,
				isFeatured: z.boolean().default(false),
				position: z.number().int().min(0).max(1000).default(0),
				translations: translations(bundleText),
				items: items.default([]),
			}),
		),
		async (c) => {
			const db = getDb();
			const {
				translations: texts,
				items: list,
				...fields
			} = c.req.valid("json");
			const { defaultLocale } = await readSettings(db);
			if (!texts[defaultLocale])
				return c.json({ error: "publish_requires_default_translation" }, 409);
			const [taken, refusal] = await Promise.all([
				db.query.bundles.findFirst({ where: eq(bundles.slug, fields.slug) }),
				refusalFor(db, list, fields.price),
			]);
			if (taken) return c.json({ error: "duplicate_slug" }, 409);
			if (refusal) return c.json(refusal, 409);
			const bundleId = sql<number>`(select id from bundles where slug = ${fields.slug})`;
			await db.batch([
				db.insert(bundles).values({ ...fields, status: "draft" }),
				...translationEntries(texts).map(([locale, text]) =>
					db.insert(bundleTranslations).values({ bundleId, locale, ...text }),
				),
				...list.map((item, index) =>
					db
						.insert(bundleItems)
						.values({ bundleId, ...item, position: index + 1 }),
				),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "bundle.create",
					entityType: "bundle",
					entityId: bundleId,
					data: { ...fields, translations: texts, items: list },
				}),
			]);
			const created = await db.query.bundles.findFirst({
				where: eq(bundles.slug, fields.slug),
			});
			if (!created) throw new Error(`Bundle ${fields.slug} missing`);
			return c.json(await written(db, created.id), 201);
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
					price,
					isFeatured: z.boolean(),
					position: z.number().int().min(0).max(1000),
					status: z.enum(PRODUCT_STATUSES),
				})
				.partial()
				.refine((v) => Object.keys(v).length > 0, "Nothing to change"),
		),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const patch = c.req.valid("json");
			const stored = await db.query.bundles.findFirst({
				where: eq(bundles.id, id),
			});
			if (!stored) return c.json({ error: "not_found" }, 404);
			if (patch.slug && patch.slug !== stored.slug) {
				if (stored.status === "published")
					return c.json({ error: "slug_locked" }, 409);
				const taken = await db.query.bundles.findFirst({
					where: eq(bundles.slug, patch.slug),
				});
				if (taken) return c.json({ error: "duplicate_slug" }, 409);
			}
			const moving = patch.status && patch.status !== stored.status;
			if (
				moving &&
				!canMoveStatus(stored.status, patch.status as ProductStatus)
			)
				return c.json({ error: "invalid_transition" }, 409);
			const status = patch.status ?? stored.status;
			const current = await storedItems(db, id);
			if (status === "published" && current.length < BUNDLE_MIN_ITEMS)
				return c.json({ error: "bundle_requires_two_items" }, 409);
			if (status !== "archived") {
				const refusal = await refusalFor(
					db,
					current,
					patch.price ?? stored.price,
				);
				if (refusal) return c.json(refusal, 409);
			}
			if (moving && patch.status === "published") {
				const { defaultLocale } = await readSettings(db);
				const translated = await db.query.bundleTranslations.findFirst({
					where: and(
						eq(bundleTranslations.bundleId, id),
						eq(bundleTranslations.locale, defaultLocale),
					),
				});
				if (!translated)
					return c.json({ error: "publish_requires_default_translation" }, 409);
			}
			const unchanged = and(
				eq(bundles.id, id),
				eq(bundles.status, stored.status),
			);
			const [, [row]] = await db.batch([
				audit(
					db,
					{
						actorUserId: c.var.adminUserId,
						...statusAudit("bundle", id, stored.status, patch.status, {
							before: stored,
							patch,
						}),
					},
					db.select({ id: bundles.id }).from(bundles).where(unchanged),
				),
				db
					.update(bundles)
					.set({ ...patch, updatedAt: now })
					.where(unchanged)
					.returning(),
			]);
			if (!row) return c.json({ error: "invalid_transition" }, 409);
			return c.json(await written(db, id));
		},
	)
	.put(
		"/:id/translations/:locale",
		validate("param", localeParam),
		validate("json", bundleText),
		async (c) => {
			const db = getDb();
			const { id, locale } = c.req.valid("param");
			const text = c.req.valid("json");
			const bundle = await db.query.bundles.findFirst({
				where: eq(bundles.id, id),
			});
			if (!bundle) return c.json({ error: "not_found" }, 404);
			const [[row]] = await db.batch([
				db
					.insert(bundleTranslations)
					.values({ bundleId: id, locale, ...text })
					.onConflictDoUpdate({
						target: [bundleTranslations.bundleId, bundleTranslations.locale],
						set: text,
					})
					.returning(),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "bundle.update",
					entityType: "bundle",
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
		validate("json", z.object({ items })),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { items: list } = c.req.valid("json");
			const bundle = await db.query.bundles.findFirst({
				where: eq(bundles.id, id),
			});
			if (!bundle) return c.json({ error: "not_found" }, 404);
			if (bundle.status === "published" && list.length < BUNDLE_MIN_ITEMS)
				return c.json({ error: "bundle_requires_two_items" }, 409);
			const refusal = await refusalFor(db, list, bundle.price);
			if (refusal) return c.json(refusal, 409);
			const current = await storedItems(db, id);
			const kept = new Set(list.map((i) => i.variantId));
			const had = new Set(current.map((i) => i.variantId));
			const ofBundle = (variantId: number) =>
				and(eq(bundleItems.bundleId, id), eq(bundleItems.variantId, variantId));
			await db.batch([
				db
					.update(bundleItems)
					.set({ position: sql`${bundleItems.position} + 1000` })
					.where(eq(bundleItems.bundleId, id)),
				...list.map((item, index) =>
					had.has(item.variantId)
						? db
								.update(bundleItems)
								.set({ quantity: item.quantity, position: index + 1 })
								.where(ofBundle(item.variantId))
						: db
								.insert(bundleItems)
								.values({ bundleId: id, ...item, position: index + 1 }),
				),
				...current
					.filter((i) => !kept.has(i.variantId))
					.map((i) => db.delete(bundleItems).where(ofBundle(i.variantId))),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "bundle.update",
					entityType: "bundle",
					entityId: id,
					data: { items: list },
				}),
			]);
			return c.json(await written(db, id));
		},
	);
