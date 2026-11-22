import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import type { Locale } from "#/db/schema";
import { storeToday } from "#/lib/dates";
import { type CatalogContext, pickLocale } from "./catalog";
import type {
	CatalogEntry,
	CatalogImage,
	CatalogVariant,
	FacetDimensions,
	Named,
} from "./catalog-query";
import { groupBy } from "./group-by";
import { mediaUrl } from "./images";
import { holdsStock } from "./inventory";
import { searchKey } from "./search";
import {
	lineMax,
	pendingHoldStart,
	sellableUnits,
	unitsAvailability,
} from "./stock";

const {
	brands,
	categories,
	categoryTranslations,
	collectionProducts,
	collections,
	collectionTranslations,
	bundleItems,
	bundles,
	inventoryMovements,
	lots,
	mediaFiles,
	orderItems,
	orders,
	productImages,
	productImageTranslations,
	products,
	productTranslations,
	variants,
} = schema;

const published = eq(products.status, "published");

export function catalogContext(
	settings: {
		defaultLocale: Locale;
		timeZone: string;
		maxQuantityPerLine: number;
	},
	locale: Locale,
): CatalogContext {
	const today = storeToday(settings.timeZone);
	return {
		locale,
		fallback: settings.defaultLocale,
		today,
		holdStart: pendingHoldStart(today, settings.timeZone),
		maxQuantityPerLine: settings.maxQuantityPerLine,
	};
}
export const localesOf = ({ locale, fallback }: CatalogContext) => [
	...new Set([locale, fallback]),
];

export const mediaImage = (
	file: { r2Key: string; width: number; height: number },
	alt: string,
): CatalogImage => ({
	url: mediaUrl(file.r2Key),
	width: file.width,
	height: file.height,
	alt,
});

// A missing text is a data error: publishing requires the default locale's.
export function textOf<T extends { locale: Locale }>(
	rows: T[],
	{ locale, fallback }: CatalogContext,
	what: string,
): T {
	const text = pickLocale(rows, locale, fallback);
	if (!text) throw new Error(`${what} has no text in ${locale} or ${fallback}`);
	return text;
}

export type VisibleBundle = {
	id: number;
	slug: string;
	isFeatured: boolean;
	price: number;
	items: { sku: string; productId: number; quantity: number }[];
};

// One D1 batch, whatever the catalogue size.
export async function loadCatalog(db: Db, context: CatalogContext) {
	const locales = localesOf(context);
	const [
		rows,
		texts,
		categoryTexts,
		sizes,
		stock,
		promised,
		memberships,
		collectionRows,
		collectionTexts,
		photos,
		alts,
		bundleRows,
	] = await db.batch([
		// Column names must be unique within a batched select: D1 returns batch rows as
		// objects keyed by name, so drizzle would misplace a repeated one.
		db
			.select({
				id: products.id,
				slug: products.slug,
				createdAt: products.createdAt,
				isFeatured: products.isFeatured,
				badge: products.badge,
				warrantyMonths: products.warrantyMonths,
				brand: {
					slug: sql<string>`${brands.slug}`.as("brand_slug"),
					name: brands.name,
				},
				categoryId: products.categoryId,
				categorySlug: sql<string>`${categories.slug}`.as("category_slug"),
				categorySortOrder: categories.sortOrder,
			})
			.from(products)
			.innerJoin(brands, eq(brands.id, products.brandId))
			.innerJoin(categories, eq(categories.id, products.categoryId))
			.where(published),
		db
			.select({
				productId: productTranslations.productId,
				locale: productTranslations.locale,
				name: productTranslations.name,
				tagline: productTranslations.tagline,
				shortSpecs: productTranslations.shortSpecs,
			})
			.from(productTranslations)
			.innerJoin(products, eq(products.id, productTranslations.productId))
			.where(and(published, inArray(productTranslations.locale, locales))),
		db
			.select()
			.from(categoryTranslations)
			.where(inArray(categoryTranslations.locale, locales)),
		db
			.select({
				id: variants.id,
				productId: variants.productId,
				sku: variants.sku,
				gtin: variants.gtin,
				optionLabel: variants.optionLabel,
				price: variants.price,
				compareAtPrice: variants.compareAtPrice,
			})
			.from(variants)
			.innerJoin(products, eq(products.id, variants.productId))
			.where(
				and(
					published,
					eq(variants.status, "active"),
					isNotNull(variants.price),
				),
			)
			.orderBy(asc(variants.price), asc(variants.id)),
		db
			.select({
				variantId: lots.variantId,
				onHand: sql<number>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
			})
			.from(lots)
			.innerJoin(inventoryMovements, eq(inventoryMovements.lotId, lots.id))
			.innerJoin(variants, eq(variants.id, lots.variantId))
			.innerJoin(products, eq(products.id, variants.productId))
			.where(published)
			.groupBy(lots.variantId),
		db
			.select({
				variantId: orderItems.variantId,
				committed: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
			})
			.from(orderItems)
			.innerJoin(orders, eq(orders.id, orderItems.orderId))
			.where(holdsStock(context.holdStart))
			.groupBy(orderItems.variantId),
		db
			.select({
				productId: collectionProducts.productId,
				collectionId: collectionProducts.collectionId,
				position: collectionProducts.position,
			})
			.from(collectionProducts)
			.innerJoin(
				collections,
				eq(collections.id, collectionProducts.collectionId),
			)
			.innerJoin(products, eq(products.id, collectionProducts.productId))
			.where(and(published, eq(collections.status, "published"))),
		db
			.select()
			.from(collections)
			.where(eq(collections.status, "published"))
			.orderBy(asc(collections.position), asc(collections.id)),
		db
			.select({
				collectionId: collectionTranslations.collectionId,
				locale: collectionTranslations.locale,
				title: collectionTranslations.title,
			})
			.from(collectionTranslations)
			.where(inArray(collectionTranslations.locale, locales)),
		db
			.select({
				id: productImages.id,
				productId: productImages.productId,
				variantId: productImages.variantId,
				kind: productImages.kind,
				r2Key: mediaFiles.r2Key,
				width: mediaFiles.width,
				height: mediaFiles.height,
			})
			.from(productImages)
			.innerJoin(mediaFiles, eq(mediaFiles.id, productImages.mediaFileId))
			.innerJoin(products, eq(products.id, productImages.productId))
			.where(
				and(
					published,
					eq(productImages.status, "active"),
					inArray(productImages.kind, ["packshot", "lifestyle"]),
				),
			)
			.orderBy(asc(productImages.position), asc(productImages.id)),
		db
			.select({
				imageId: productImageTranslations.imageId,
				locale: productImageTranslations.locale,
				alt: productImageTranslations.alt,
			})
			.from(productImageTranslations)
			.innerJoin(
				productImages,
				eq(productImages.id, productImageTranslations.imageId),
			)
			.innerJoin(products, eq(products.id, productImages.productId))
			.where(
				and(
					published,
					eq(productImages.status, "active"),
					inArray(productImageTranslations.locale, locales),
				),
			),
		db
			.select({
				id: bundles.id,
				slug: bundles.slug,
				isFeatured: bundles.isFeatured,
				price: bundles.price,
				variantId: bundleItems.variantId,
				quantity: bundleItems.quantity,
			})
			.from(bundles)
			.innerJoin(bundleItems, eq(bundleItems.bundleId, bundles.id))
			.where(eq(bundles.status, "published"))
			.orderBy(
				asc(bundles.position),
				asc(bundles.id),
				asc(bundleItems.position),
			),
	]);

	const named = <T extends { locale: Locale }>(
		rows: T[],
		what: string,
		name: (t: T) => string,
	) => name(textOf(rows, context, what));
	const categoryName = (id: number, slug: string) =>
		named(
			categoryTexts.filter((t) => t.categoryId === id),
			`Category ${slug}`,
			(t) => t.name,
		);
	const collectionTitle = (id: number, slug: string) =>
		named(
			collectionTexts.filter((t) => t.collectionId === id),
			`Collection ${slug}`,
			(t) => t.title,
		);
	const onHand = new Map(stock.map((s) => [s.variantId, s.onHand]));
	const committed = new Map(promised.map((s) => [s.variantId, s.committed]));
	const sizesOf = groupBy(sizes, (v) => v.productId);
	const membershipsOf = groupBy(memberships, (m) => m.productId);
	const photosOf = groupBy(photos, (p) => p.productId);
	const altsOf = groupBy(alts, (a) => a.imageId);
	const collectionById = new Map(collectionRows.map((c) => [c.id, c]));

	const productOfVariant = new Map(sizes.map((v) => [v.id, v]));
	const visibleBundles: VisibleBundle[] = [
		...groupBy(bundleRows, (r) => r.id).values(),
	].flatMap((rows) => {
		const [first] = rows;
		const items = rows.map((i) => productOfVariant.get(i.variantId));
		if (items.some((s) => s === undefined)) return [];
		return [
			{
				id: first.id,
				slug: first.slug,
				isFeatured: first.isFeatured,
				price: first.price,
				items: (items as typeof sizes).map((s, i) => ({
					sku: s.sku,
					productId: s.productId,
					quantity: rows[i].quantity,
				})),
			},
		];
	});

	const entries = rows.flatMap((p): CatalogEntry[] => {
		const productSizes = sizesOf.get(p.id) ?? [];
		const variantsForSale = productSizes.map((v): CatalogVariant => {
			const sellable = sellableUnits(
				onHand.get(v.id) ?? 0,
				committed.get(v.id) ?? 0,
			);
			return {
				sku: v.sku,
				gtin: v.gtin,
				optionLabel: v.optionLabel,
				price: v.price as number,
				compareAtPrice: v.compareAtPrice,
				availability: unitsAvailability(sellable),
				maxQuantity: lineMax(sellable, context.maxQuantityPerLine),
			};
		});
		const [cheapest, ...others] = variantsForSale;
		if (!cheapest)
			throw new Error(
				`Published product ${p.slug} has no active priced variant`,
			);
		const text = textOf(
			texts.filter((t) => t.productId === p.id),
			context,
			`Product ${p.slug}`,
		);
		const fallbackName = texts.find(
			(t) => t.productId === p.id && t.locale === context.fallback,
		)?.name;
		const defaultSize = productSizes[0].id;
		const photo = (kind: "packshot" | "lifestyle") => {
			const image = (photosOf.get(p.id) ?? []).find(
				(i) =>
					i.kind === kind &&
					(i.variantId === null || i.variantId === defaultSize),
			);
			if (!image) return null;
			const alt =
				pickLocale(altsOf.get(image.id) ?? [], context.locale, context.fallback)
					?.alt ?? `${p.brand.name} ${text.name}`;
			return mediaImage(image, alt);
		};
		const category = {
			slug: p.categorySlug,
			name: categoryName(p.categoryId, p.categorySlug),
			sortOrder: p.categorySortOrder,
		};
		return [
			{
				id: p.id,
				slug: p.slug,
				name: text.name,
				tagline: text.tagline,
				shortSpecs: text.shortSpecs,
				isFeatured: p.isFeatured,
				badge: p.badge,
				warrantyMonths: p.warrantyMonths,
				brand: p.brand,
				category,
				collections: (membershipsOf.get(p.id) ?? []).map((m) => {
					const collection = collectionById.get(m.collectionId);
					if (!collection)
						throw new Error(`Collection ${m.collectionId} is not published`);
					return { slug: collection.slug, position: m.position };
				}),
				bundles: visibleBundles
					.filter((r) => r.items.some((s) => s.productId === p.id))
					.map((r) => r.slug),
				variants: [cheapest, ...others],
				packshot: photo("packshot"),
				lifestyle: photo("lifestyle"),
				createdAt: p.createdAt,
				searchText: searchKey(
					p.brand.name,
					text.name,
					fallbackName === text.name ? null : fallbackName,
					category.name,
					text.shortSpecs,
					...variantsForSale.map((v) => v.sku),
					...variantsForSale.map((v) => v.optionLabel),
				),
			},
		];
	});

	const collator = new Intl.Collator(context.locale, { sensitivity: "base" });
	const unique = <T extends { slug: string }>(list: T[]) => [
		...new Map(list.map((x) => [x.slug, x])).values(),
	];
	const dimensions: FacetDimensions = {
		category: unique(entries.map((e) => e.category))
			.sort(
				(a, b) => a.sortOrder - b.sortOrder || collator.compare(a.name, b.name),
			)
			.map(({ slug, name }) => ({ slug, name })),
		brand: unique(entries.map((e) => e.brand)).sort((a, b) =>
			collator.compare(a.name, b.name),
		),
		collection: collectionRows.map(
			(c): Named => ({ slug: c.slug, name: collectionTitle(c.id, c.slug) }),
		),
	};
	return { entries, dimensions, bundles: visibleBundles };
}

export type LoadedCatalog = Awaited<ReturnType<typeof loadCatalog>>;
