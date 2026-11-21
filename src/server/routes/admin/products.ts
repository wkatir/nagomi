import { and, asc, eq, getTableColumns, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type Db, getDb, schema } from "#/db";
import {
	ARCHIVABLE_STATUSES,
	now,
	PRODUCT_STATUSES,
	type ProductStatus,
	SIZE_UNITS,
	SKIN_TYPES,
} from "#/db/schema";
import { storeToday } from "#/lib/dates";
import { PRODUCT_LIMITS, productListSearch } from "#/lib/schemas/products";
import type { AdminEnv } from "#/server/auth";
import { idParam, invalidRequest, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { statusAudit } from "../../domain/audit-actions";
import { inList, insertIfExists, qualified } from "../../domain/d1";
import { InvalidGtinError, normalizeGtin } from "../../domain/gtin";
import { mediaUrl } from "../../domain/images";
import {
	committedByVariant,
	latestLandedCostE4,
	stockByVariant,
} from "../../domain/inventory";
import { productPhotoColumns } from "../../domain/product-photos";
import { pagedProducts, productFilter } from "../../domain/product-queries";
import {
	photoWithoutAlt,
	publishMissing,
	skuIsFree,
} from "../../domain/product-rules";
import { e4ToMinor } from "../../domain/receiving";
import { searchKey, withoutSearchKey } from "../../domain/search";
import { getSettings, readSettings } from "../../domain/settings";
import { canMoveStatus } from "../../domain/status";
import { pendingHoldStart, sellableUnits } from "../../domain/stock";
import {
	optionalText,
	requiredText,
	searchQuery,
	seoFields,
	slug,
	translationEntries,
	translations,
} from "./catalog-inputs";

const {
	brands,
	categories,
	collectionProducts,
	concerns,
	inventoryMovements,
	lots,
	mediaFiles,
	productConcerns,
	productImages,
	productImageTranslations,
	products,
	productSkinTypes,
	productTranslations,
	purchaseOrderItems,
	purchaseOrders,
	variants,
} = schema;

// Fields left out are null on a new translation and unchanged on an existing one.
const productText = z.object({
	name: requiredText(PRODUCT_LIMITS.name),
	tagline: optionalText(PRODUCT_LIMITS.tagline).optional(),
	description: optionalText(PRODUCT_LIMITS.description).optional(),
	howToUse: optionalText(PRODUCT_LIMITS.howToUse).optional(),
	// Lists, one item per line.
	keyIngredients: optionalText(PRODUCT_LIMITS.keyIngredients).optional(),
	benefits: optionalText(PRODUCT_LIMITS.benefits).optional(),
	cautions: optionalText(PRODUCT_LIMITS.cautions).optional(),
	...seoFields,
});

const concernIds = z
	.array(z.number().int().positive())
	.max(20)
	.refine((ids) => new Set(ids).size === ids.length, "Duplicate concern");
const skinTypes = z
	.array(z.enum(SKIN_TYPES))
	.max(SKIN_TYPES.length)
	.refine((s) => new Set(s).size === s.length, "Duplicate skin type");
const productFields = z.object({
	slug,
	brandId: z.number().int().positive(),
	categoryId: z.number().int().positive(),
	// As printed on the pack, so not translated.
	inci: optionalText(PRODUCT_LIMITS.inci),
	sanitaryRegistration: optionalText(PRODUCT_LIMITS.sanitaryRegistration),
	concernIds,
	skinTypes,
});

const sku = z
	.string()
	.trim()
	.toUpperCase()
	.regex(/^[A-Z0-9]+(?:[-_.][A-Z0-9]+)*$/)
	.max(PRODUCT_LIMITS.sku);
const gtin = z
	.string()
	.max(20)
	.transform((value, ctx) => {
		try {
			return normalizeGtin(value);
		} catch (e) {
			if (!(e instanceof InvalidGtinError)) throw e;
			ctx.addIssue({ code: "custom", message: "Invalid GTIN or check digit" });
			return z.NEVER;
		}
	})
	.nullable();
const variantFields = z.object({
	sku,
	price: z.number().int().positive().max(100_000_000).nullable(),
	compareAtPrice: z.number().int().positive().max(100_000_000).nullable(),
	sizeValue: z.number().int().positive().max(100_000).nullable(),
	sizeUnit: z.enum(SIZE_UNITS).nullable(),
	gtin,

	reorderPoint: z.number().int().min(0).max(100_000).nullable(),
	status: z.enum(ARCHIVABLE_STATUSES),
});
// Mirrors the table checks on the variant as it would be stored.
const variantState = z
	.object({
		price: z.number().nullable(),
		compareAtPrice: z.number().nullable(),
		sizeValue: z.number().nullable(),
		sizeUnit: z.string().nullable(),
	})
	.refine(
		(v) =>
			v.compareAtPrice === null ||
			(v.price !== null && v.compareAtPrice > v.price),
		{
			message: "compareAtPrice must be greater than price",
			path: ["compareAtPrice"],
		},
	)
	.refine((v) => (v.sizeValue === null) === (v.sizeUnit === null), {
		message: "sizeValue and sizeUnit go together",
		path: ["sizeUnit"],
	});

const newVariantFields = variantFields.omit({ status: true }).partial({
	price: true,
	compareAtPrice: true,
	sizeValue: true,
	sizeUnit: true,
	gtin: true,
	reorderPoint: true,
});
const withNulls = (input: z.output<typeof newVariantFields>) => ({
	price: null,
	compareAtPrice: null,
	sizeValue: null,
	sizeUnit: null,
	gtin: null,
	reorderPoint: null,
	...input,
});
const newVariantInput = newVariantFields.superRefine((v, ctx) => {
	const state = variantState.safeParse(withNulls(v));
	if (!state.success)
		for (const issue of state.error.issues)
			ctx.addIssue({
				code: "custom",
				message: issue.message,
				path: issue.path,
			});
});

const listQuery = z.object({
	q: searchQuery,
	status: z.enum(PRODUCT_STATUSES).optional(),
	brandId: z.coerce.number().int().positive().optional(),
	categoryId: z.coerce.number().int().positive().optional(),
	concernId: z.coerce.number().int().positive().optional(),
});

async function referencesAvailable(
	db: Db,
	refs: { brandId?: number; categoryId?: number; concernIds?: number[] },
) {
	const [brand, category, found] = await Promise.all([
		refs.brandId === undefined
			? true
			: db.query.brands
					.findFirst({
						where: and(
							eq(brands.id, refs.brandId),
							eq(brands.status, "active"),
						),
					})
					.then(Boolean),
		refs.categoryId === undefined
			? true
			: db.query.categories
					.findFirst({
						where: and(
							eq(categories.id, refs.categoryId),
							eq(categories.status, "active"),
						),
					})
					.then(Boolean),
		refs.concernIds?.length
			? db
					.select({ id: concerns.id })
					.from(concerns)
					.where(
						and(
							inList(concerns.id, refs.concernIds),
							eq(concerns.status, "active"),
						),
					)
			: [],
	]);
	return brand && category && found.length === (refs.concernIds?.length ?? 0);
}

async function productDetail(db: Db, id: number) {
	const product = await db.query.products.findFirst({
		where: eq(products.id, id),
	});
	if (!product) return null;
	const { defaultLocale } = await readSettings(db);
	const [
		translations,
		productVariants,
		tags,
		images,
		memberships,
		skins,
		missing,
	] = await Promise.all([
		db
			.select()
			.from(productTranslations)
			.where(eq(productTranslations.productId, id)),
		db
			.select({
				...getTableColumns(variants),
				skuEditable: skuIsFree(
					qualified(variants.productId),
					qualified(variants.id),
				).mapWith(Boolean),
				// Expired lots too: what archiving the size would leave without a home
				// (variant_has_stock).
				onHand: sql<number>`coalesce((select sum(m.quantity) from lots l join inventory_movements m on m.lot_id = l.id where l.variant_id = ${qualified(variants.id)}), 0)`,
			})
			.from(variants)
			.where(eq(variants.productId, id))
			.orderBy(asc(variants.id)),
		db
			.select({ concernId: productConcerns.concernId })
			.from(productConcerns)
			.where(eq(productConcerns.productId, id)),
		db
			.select(productPhotoColumns)
			.from(productImages)
			.innerJoin(mediaFiles, eq(mediaFiles.id, productImages.mediaFileId))
			.where(eq(productImages.productId, id))
			.orderBy(
				asc(productImages.status),
				asc(productImages.position),
				asc(productImages.id),
			),
		db
			.select({ collectionId: collectionProducts.collectionId })
			.from(collectionProducts)
			.where(eq(collectionProducts.productId, id)),
		db
			.select({ skinType: productSkinTypes.skinType })
			.from(productSkinTypes)
			.where(eq(productSkinTypes.productId, id)),
		publishMissing(db, id, defaultLocale),
	]);
	const alts =
		images.length === 0
			? []
			: await db
					.select()
					.from(productImageTranslations)
					.where(
						inList(
							productImageTranslations.imageId,
							images.map((i) => i.id),
						),
					);
	return {
		...product,
		publishMissing: missing,
		translations: translations.map(withoutSearchKey),
		variants: productVariants.map(withoutSearchKey),
		concernIds: tags.map((t) => t.concernId),
		skinTypes: SKIN_TYPES.filter((s) => skins.some((r) => r.skinType === s)),
		// Collections are edited from the collection (PUT /collections/:id/products).
		collectionIds: memberships.map((m) => m.collectionId),
		images: images.map((i) => ({
			...i,
			url: mediaUrl(i.r2Key),
			alt: Object.fromEntries(
				alts.filter((a) => a.imageId === i.id).map((a) => [a.locale, a.alt]),
			),
		})),
	};
}

export const productsRouter = new Hono<AdminEnv>()
	.get("/", async (c) => {
		const db = getDb();
		const query = listQuery.safeParse(c.req.query());
		if (!query.success) return invalidRequest(c, query.error);
		const filter = query.data;
		const { defaultLocale, timeZone } = await getSettings(db);
		const rows = await db
			.select({
				productId: products.id,
				slug: products.slug,
				status: products.status,
				brand: brands.name,
				category: categories.slug,
				name: productTranslations.name,
				variantId: variants.id,
				sku: variants.sku,
				sizeValue: variants.sizeValue,
				sizeUnit: variants.sizeUnit,
				price: variants.price,
				compareAtPrice: variants.compareAtPrice,
				gtin: variants.gtin,

				variantStatus: variants.status,
				reorderPoint: variants.reorderPoint,
			})
			.from(products)
			.innerJoin(brands, eq(brands.id, products.brandId))
			.innerJoin(categories, eq(categories.id, products.categoryId))
			.innerJoin(variants, eq(variants.productId, products.id))
			.leftJoin(
				productTranslations,
				and(
					eq(productTranslations.productId, products.id),
					eq(productTranslations.locale, defaultLocale),
				),
			)
			.where(productFilter(db, filter))
			.orderBy(asc(brands.name), asc(products.slug), asc(variants.id));
		const today = storeToday(timeZone);
		const [stock, promised, landed] = await Promise.all([
			stockByVariant(db, today),
			committedByVariant(db, pendingHoldStart(today, timeZone)),
			latestLandedCostE4(db),
		]);
		const committed = new Map(promised.map((p) => [p.variantId, p.committed]));
		return c.json(
			rows.map((r) => {
				const units = stock.get(r.variantId);
				const cost = landed.get(r.variantId);
				const onHand = units?.onHand ?? 0;
				const held = committed.get(r.variantId) ?? 0;
				return {
					...r,
					onHand,
					committed: held,
					available: sellableUnits(onHand, held),
					expired: units?.expired ?? 0,
					latestUnitCost: cost === undefined ? null : e4ToMinor(cost),
				};
			}),
		);
	})
	.get("/list", validate("query", productListSearch), async (c) => {
		const db = getDb();
		const { defaultLocale, timeZone } = await getSettings(db);
		const today = storeToday(timeZone);
		return c.json(
			await pagedProducts(
				db,
				{ today, holdStart: pendingHoldStart(today, timeZone), defaultLocale },
				c.req.valid("query"),
			),
		);
	})
	.get("/:id", validate("param", idParam), async (c) => {
		const { id } = c.req.valid("param");
		const product = await productDetail(getDb(), id);
		return product ? c.json(product) : c.json({ error: "not_found" }, 404);
	})
	.post(
		"/",
		validate(
			"json",
			productFields
				.partial({
					inci: true,
					sanitaryRegistration: true,
					concernIds: true,
					skinTypes: true,
				})
				.extend({
					translations: translations(productText),
					variant: newVariantInput.optional(),
				}),
		),
		async (c) => {
			const db = getDb();
			const {
				translations: texts,
				concernIds: tags = [],
				skinTypes: skins = [],
				variant: size,
				...fields
			} = c.req.valid("json");
			const variant = size && withNulls(size);
			const { defaultLocale } = await getSettings(db);
			if (!texts[defaultLocale])
				return c.json({ error: "publish_requires_default_translation" }, 409);
			const [taken, available] = await Promise.all([
				db.query.products.findFirst({ where: eq(products.slug, fields.slug) }),
				referencesAvailable(db, { ...fields, concernIds: tags }),
			]);
			if (taken) return c.json({ error: "duplicate_slug" }, 409);
			if (!available) return c.json({ error: "reference_unavailable" }, 409);
			const productId = sql<number>`(select id from products where slug = ${fields.slug})`;
			await db.batch([
				db.insert(products).values({ ...fields, status: "draft" }),
				...translationEntries(texts).map(([locale, text]) =>
					db.insert(productTranslations).values({
						productId,
						locale,
						...text,
						searchKey: searchKey(text.name),
					}),
				),
				...tags.map((concernId) =>
					db.insert(productConcerns).values({ productId, concernId }),
				),
				...skins.map((skinType) =>
					db.insert(productSkinTypes).values({ productId, skinType }),
				),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "product.create",
					entityType: "product",
					entityId: productId,
					data: {
						...fields,
						concernIds: tags,
						skinTypes: skins,
						translations: texts,
					},
				}),
				...(variant
					? [
							// A taken SKU or barcode fails the batch, and with it the whole product.
							db.insert(variants).values({
								...variant,
								productId,
								searchKey: searchKey(variant.sku, variant.gtin),
							}),
							audit(db, {
								actorUserId: c.var.adminUserId,
								action: "variant.create",
								entityType: "variant",
								entityId: sql<number>`(select id from variants where sku = ${variant.sku})`,
								data: variant,
							}),
						]
					: []),
			]);
			const created = await db.query.products.findFirst({
				where: eq(products.slug, fields.slug),
			});
			if (!created) throw new Error(`Product ${fields.slug} missing`);
			const detail = await productDetail(db, created.id);
			if (!detail) throw new Error(`Product ${created.id} missing`);
			return c.json(detail, 201);
		},
	)
	.patch(
		"/:id",
		validate("param", idParam),
		validate(
			"json",
			productFields
				.extend({ status: z.enum(PRODUCT_STATUSES) })
				.partial()
				.refine((v) => Object.keys(v).length > 0, "Nothing to change"),
		),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const {
				concernIds: tags,
				skinTypes: skins,
				...patch
			} = c.req.valid("json");
			const stored = await db.query.products.findFirst({
				where: eq(products.id, id),
			});
			if (!stored) return c.json({ error: "not_found" }, 404);
			const moving =
				patch.status !== undefined && patch.status !== stored.status;
			if (
				moving &&
				!canMoveStatus(stored.status, patch.status as ProductStatus)
			)
				return c.json({ error: "invalid_transition" }, 409);
			if (patch.slug && patch.slug !== stored.slug) {
				if (stored.status !== "draft" || moving)
					return c.json({ error: "slug_locked" }, 409);
				const taken = await db.query.products.findFirst({
					where: eq(products.slug, patch.slug),
				});
				if (taken) return c.json({ error: "duplicate_slug" }, 409);
			}
			const publishing = moving && patch.status === "published";
			const available = await referencesAvailable(db, {
				// Publishing checks the brand and category it will have, changed or not.
				brandId: patch.brandId ?? (publishing ? stored.brandId : undefined),
				categoryId:
					patch.categoryId ?? (publishing ? stored.categoryId : undefined),
				concernIds: tags,
			});
			if (!available) return c.json({ error: "reference_unavailable" }, 409);
			const { defaultLocale } = await getSettings(db);
			if (publishing) {
				// The brand and the category were checked above, as they will be.
				const missing = await publishMissing(db, id, defaultLocale);
				if (missing.includes("price"))
					return c.json({ error: "publish_requires_price" }, 409);
				if (missing.includes("text"))
					return c.json({ error: "publish_requires_default_translation" }, 409);
				if (missing.includes("photo_alt"))
					return c.json({ error: "image_alt_required" }, 409);
			}
			const unchanged = and(
				eq(products.id, id),
				eq(products.status, stored.status),
				publishing ? sql`not ${photoWithoutAlt(id, defaultLocale)}` : undefined,
			);
			const stillAsRead = db
				.select({ id: products.id })
				.from(products)
				.where(unchanged);
			const results = await db.batch([
				audit(
					db,
					{
						actorUserId: c.var.adminUserId,
						...statusAudit("product", id, stored.status, patch.status, {
							before: stored,
							patch,
							concernIds: tags,
							skinTypes: skins,
						}),
					},
					stillAsRead,
				),
				...(tags
					? [
							db
								.delete(productConcerns)
								.where(
									and(
										eq(productConcerns.productId, id),
										sql`exists ${stillAsRead}`,
									),
								),
							...tags.map((concernId) =>
								insertIfExists(
									db,
									productConcerns,
									{ productId: id, concernId },
									stillAsRead,
								),
							),
						]
					: []),
				...(skins
					? [
							db
								.delete(productSkinTypes)
								.where(
									and(
										eq(productSkinTypes.productId, id),
										sql`exists ${stillAsRead}`,
									),
								),
							...skins.map((skinType) =>
								insertIfExists(
									db,
									productSkinTypes,
									{ productId: id, skinType },
									stillAsRead,
								),
							),
						]
					: []),
				db
					.update(products)
					.set({ ...patch, updatedAt: now })
					.where(unchanged)
					.returning({ id: products.id }),
			]);
			const updated = results.at(-1) as { id: number }[];
			if (updated.length === 0)
				return c.json(
					{
						error: publishing ? "image_alt_required" : "invalid_transition",
					},
					409,
				);
			const detail = await productDetail(db, id);
			if (!detail) throw new Error(`Product ${id} missing`);
			return c.json(detail);
		},
	)
	.put(
		"/:id/translations",
		validate("param", idParam),
		validate("json", z.object({ translations: translations(productText) })),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { translations: texts } = c.req.valid("json");
			const product = await db.query.products.findFirst({
				where: eq(products.id, id),
			});
			if (!product) return c.json({ error: "not_found" }, 404);
			await db.batch([
				db.update(products).set({ updatedAt: now }).where(eq(products.id, id)),
				...translationEntries(texts).map(([locale, text]) =>
					db
						.insert(productTranslations)
						.values({
							...text,
							productId: id,
							locale,
							searchKey: searchKey(text.name),
						})
						.onConflictDoUpdate({
							target: [
								productTranslations.productId,
								productTranslations.locale,
							],
							set: { ...text, searchKey: searchKey(text.name) },
						}),
				),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "product.update",
					entityType: "product",
					entityId: id,
					data: { translations: texts },
				}),
			]);
			return c.json({ ok: true });
		},
	)
	.post(
		"/:id/variants",
		validate("param", idParam),
		validate("json", newVariantInput),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const variant = withNulls(c.req.valid("json"));
			const product = await db.query.products.findFirst({
				where: eq(products.id, id),
			});
			if (!product) return c.json({ error: "not_found" }, 404);
			if (product.status === "archived")
				return c.json({ error: "invalid_transition" }, 409);
			const [skuTaken, gtinTaken] = await Promise.all([
				db.query.variants.findFirst({ where: eq(variants.sku, variant.sku) }),
				variant.gtin
					? db.query.variants.findFirst({
							where: eq(variants.gtin, variant.gtin),
						})
					: undefined,
			]);
			if (skuTaken) return c.json({ error: "duplicate_sku" }, 409);
			if (gtinTaken) return c.json({ error: "duplicate_gtin" }, 409);
			const variantId = sql<number>`(select id from variants where sku = ${variant.sku})`;
			const [[row]] = await db.batch([
				db
					.insert(variants)
					.values({
						...variant,
						productId: id,
						searchKey: searchKey(variant.sku, variant.gtin),
					})
					.returning(),
				db.update(products).set({ updatedAt: now }).where(eq(products.id, id)),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "variant.create",
					entityType: "variant",
					entityId: variantId,
					data: { productId: id, ...variant },
				}),
			]);
			return c.json(withoutSearchKey(row), 201);
		},
	)
	// The last priced variant of a published product keeps its price and stays active
	// (triggers).
	.patch(
		"/variants/:id",
		validate("param", idParam),
		validate(
			"json",
			variantFields
				.extend({ archiveWithStock: z.literal(true) })
				.partial()
				.refine((v) => Object.keys(v).length > 0, "Nothing to change"),
		),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { archiveWithStock, ...patch } = c.req.valid("json");
			const stored = await db.query.variants.findFirst({
				where: eq(variants.id, id),
			});
			if (!stored) return c.json({ error: "not_found" }, 404);
			const state = variantState.safeParse({ ...stored, ...patch });
			if (!state.success) return invalidRequest(c, state.error);
			const renaming = patch.sku !== undefined && patch.sku !== stored.sku;
			const archiving =
				patch.status === "archived" && stored.status !== "archived";
			const skuFree = skuIsFree(stored.productId, id);
			const onOpenPurchase = sql`exists (select 1 from ${purchaseOrderItems} poi join ${purchaseOrders} po on po.id = poi.purchase_order_id where poi.variant_id = ${id} and po.status in ('draft', 'ordered', 'partially_received'))`;
			if (renaming) {
				const [usage] = await db
					.select({
						free: sql<number>`${skuFree}`,
						taken: sql<number>`(select count(*) from ${variants} v where v.sku = ${patch.sku})`,
					})
					.from(variants)
					.where(eq(variants.id, id));
				if (!usage) throw new Error(`Variant ${id} missing`);
				if (!usage.free) return c.json({ error: "sku_locked" }, 409);
				if (usage.taken) return c.json({ error: "duplicate_sku" }, 409);
			}
			if (archiving) {
				const [usage] = await db
					.select({
						open: sql<number>`${onOpenPurchase}`,
						onHand: sql<number>`(select coalesce(sum(m.quantity), 0) from ${inventoryMovements} m join ${lots} l on l.id = m.lot_id where l.variant_id = ${id})`,
					})
					.from(variants)
					.where(eq(variants.id, id));
				if (!usage) throw new Error(`Variant ${id} missing`);
				if (usage.open) return c.json({ error: "in_use" }, 409);
				if (usage.onHand && !archiveWithStock)
					return c.json(
						{ error: "variant_has_stock", onHand: usage.onHand },
						409,
					);
			}
			if (patch.gtin && patch.gtin !== stored.gtin) {
				const taken = await db.query.variants.findFirst({
					where: eq(variants.gtin, patch.gtin),
				});
				if (taken) return c.json({ error: "duplicate_gtin" }, 409);
			}
			const target = and(
				eq(variants.id, id),
				renaming ? skuFree : undefined,
				archiving ? sql`not ${onOpenPurchase}` : undefined,
			);
			const stillValid = db
				.select({ id: variants.id })
				.from(variants)
				.where(target);
			const [, , rows] = await db.batch([
				audit(
					db,
					{
						actorUserId: c.var.adminUserId,
						...statusAudit("variant", id, stored.status, patch.status, {
							before: stored,
							patch,
						}),
					},
					stillValid,
				),
				db
					.update(products)
					.set({ updatedAt: now })
					.where(
						and(eq(products.id, stored.productId), sql`exists ${stillValid}`),
					),
				db
					.update(variants)
					.set({
						...patch,
						...(patch.sku !== undefined || patch.gtin !== undefined
							? {
									searchKey: searchKey(
										patch.sku ?? stored.sku,
										patch.gtin === undefined ? stored.gtin : patch.gtin,
									),
								}
							: {}),
					})
					.where(target)
					.returning(),
			]);
			const [row] = rows;
			if (!row)
				return c.json({ error: renaming ? "sku_locked" : "in_use" }, 409);
			return c.json(withoutSearchKey(row));
		},
	);
