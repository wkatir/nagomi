import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import type { Locale } from "#/db/schema";
import { inList } from "./d1";
import { mediaUrl } from "./images";
import { onHandByVariant } from "./inventory";
import { productPhotoColumns } from "./product-photos";
import { lineMax, sellableUnits, unitsAvailability } from "./stock";

const {
	brands,
	categories,
	categoryTranslations,
	bundleItems,
	bundles,
	bundleTranslations,
	mediaFiles,
	productImages,
	productImageTranslations,
	products,
	productSpecs,
	productSpecTranslations,
	productTranslations,
	variants,
} = schema;

// `fallback` is the store default locale.
export type CatalogContext = {
	locale: Locale;
	fallback: Locale;
	today: string;
	maxQuantityPerLine: number;
};

export function pickLocale<T extends { locale: Locale }>(
	rows: T[],
	locale: Locale,
	fallback: Locale,
): T | undefined {
	return (
		rows.find((r) => r.locale === locale) ??
		rows.find((r) => r.locale === fallback)
	);
}

export async function listCatalog(
	db: Db,
	{ locale, fallback, maxQuantityPerLine }: CatalogContext,
	filter?: { slugs?: string[]; variantIds?: number[]; skus?: string[] },
) {
	const rows = await db
		.select({
			productId: products.id,
			slug: products.slug,
			warrantyMonths: products.warrantyMonths,
			isFeatured: products.isFeatured,
			badge: products.badge,
			brand: brands.name,
			categoryId: categories.id,
			categorySlug: categories.slug,
			categorySortOrder: categories.sortOrder,
			variantId: variants.id,
			sku: variants.sku,
			optionLabel: variants.optionLabel,
			price: variants.price,
			compareAtPrice: variants.compareAtPrice,
		})
		.from(products)
		.innerJoin(brands, eq(brands.id, products.brandId))
		.innerJoin(categories, eq(categories.id, products.categoryId))
		.innerJoin(
			variants,
			and(
				eq(variants.productId, products.id),
				eq(variants.status, "active"),
				isNotNull(variants.price),
			),
		)
		.where(
			and(
				eq(products.status, "published"),
				filter?.slugs ? inList(products.slug, filter.slugs) : undefined,
				filter?.variantIds ? inList(variants.id, filter.variantIds) : undefined,
				filter?.skus ? inList(variants.sku, filter.skus) : undefined,
			),
		)
		.orderBy(asc(categories.sortOrder), asc(products.slug));
	if (rows.length === 0) return [];

	const productIds = [...new Set(rows.map((r) => r.productId))];
	const categoryIds = [...new Set(rows.map((r) => r.categoryId))];
	const variantIds = rows.map((r) => r.variantId);
	const [texts, categoryTexts, images, stock] = await Promise.all([
		db
			.select()
			.from(productTranslations)
			.where(inList(productTranslations.productId, productIds)),
		db
			.select()
			.from(categoryTranslations)
			.where(inList(categoryTranslations.categoryId, categoryIds)),
		db
			.select(productPhotoColumns)
			.from(productImages)
			.innerJoin(mediaFiles, eq(mediaFiles.id, productImages.mediaFileId))
			.where(
				and(
					inList(productImages.productId, productIds),
					eq(productImages.status, "active"),
				),
			)
			.orderBy(asc(productImages.position), asc(productImages.id)),
		onHandByVariant(db, variantIds),
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

	const onHand = new Map(stock.map((s) => [s.variantId, s.onHand]));
	const list = rows.map((r) => {
		const sellable = sellableUnits(onHand.get(r.variantId) ?? 0);
		const text = pickLocale(
			texts.filter((t) => t.productId === r.productId),
			locale,
			fallback,
		);
		if (!text)
			throw new Error(
				`Product ${r.slug} has no translation for ${locale} or ${fallback}`,
			);
		const categoryText = pickLocale(
			categoryTexts.filter((c) => c.categoryId === r.categoryId),
			locale,
			fallback,
		);
		if (!categoryText)
			throw new Error(
				`Category ${r.categorySlug} has no translation for ${locale} or ${fallback}`,
			);
		return {
			slug: r.slug,
			sku: r.sku,
			brand: r.brand,
			name: text.name,
			tagline: text.tagline,
			shortSpecs: text.shortSpecs,
			description: text.description,
			seoTitle: text.seoTitle,
			seoDescription: text.seoDescription,
			warrantyMonths: r.warrantyMonths,
			isFeatured: r.isFeatured,
			badge: r.badge,
			category: {
				slug: r.categorySlug,
				sortOrder: r.categorySortOrder,
				name: categoryText.name,
			},
			optionLabel: r.optionLabel,
			price: r.price as number,
			compareAtPrice: r.compareAtPrice,
			availability: unitsAvailability(sellable),
			maxQuantity: lineMax(sellable, maxQuantityPerLine),
			// Publishing and the default-locale change require the default locale's alt (checked
			// by the API, not the schema); the brand and name only label data that slipped by.
			images: images
				.filter(
					(i) =>
						i.productId === r.productId &&
						(i.variantId === null || i.variantId === r.variantId),
				)
				.map((i) => ({
					url: mediaUrl(i.r2Key),
					kind: i.kind,
					width: i.width,
					height: i.height,
					alt:
						pickLocale(
							alts.filter((a) => a.imageId === i.id),
							locale,
							fallback,
						)?.alt ?? `${r.brand} ${text.name}`,
				})),
			productId: r.productId,
			variantId: r.variantId,
		};
	});
	// Stable sort: sold out last, otherwise in category order.
	return list.sort(
		(a, b) =>
			Number(a.availability === "sold_out") -
			Number(b.availability === "sold_out"),
	);
}

export type CatalogProduct = Awaited<ReturnType<typeof listCatalog>>[number];

export async function listSpecs(
	db: Db,
	productId: number,
	locale: Locale,
	fallback: Locale,
) {
	const rows = await db
		.select()
		.from(productSpecs)
		.where(eq(productSpecs.productId, productId))
		.orderBy(asc(productSpecs.position));
	if (rows.length === 0) return [];
	const texts = await db
		.select()
		.from(productSpecTranslations)
		.where(
			inList(
				productSpecTranslations.specId,
				rows.map((r) => r.id),
			),
		);
	return rows.map((r) => {
		const text = pickLocale(
			texts.filter((t) => t.specId === r.id),
			locale,
			fallback,
		);
		if (!text)
			throw new Error(
				`Spec ${r.id} has no translation for ${locale} or ${fallback}`,
			);
		return { label: text.label, value: text.value };
	});
}

export async function listBundles(
	db: Db,
	context: CatalogContext,
	filter?: { slug?: string },
) {
	const { locale, fallback } = context;
	const rs = await db
		.select()
		.from(bundles)
		.where(
			and(
				eq(bundles.status, "published"),
				filter?.slug ? eq(bundles.slug, filter.slug) : undefined,
			),
		)
		.orderBy(asc(bundles.position));
	if (rs.length === 0) return [];
	const ids = rs.map((r) => r.id);
	const [texts, items] = await Promise.all([
		db
			.select()
			.from(bundleTranslations)
			.where(inList(bundleTranslations.bundleId, ids)),
		db
			.select()
			.from(bundleItems)
			.where(inList(bundleItems.bundleId, ids))
			.orderBy(asc(bundleItems.position)),
	]);
	const products = await listCatalog(db, context, {
		variantIds: [...new Set(items.map((i) => i.variantId))],
	});
	return rs.flatMap((r) => {
		const text = pickLocale(
			texts.filter((t) => t.bundleId === r.id),
			locale,
			fallback,
		);
		if (!text)
			throw new Error(
				`Bundle ${r.slug} has no translation for ${locale} or ${fallback}`,
			);
		const lines = items
			.filter((i) => i.bundleId === r.id)
			.map((i) => ({
				quantity: i.quantity,
				product: products.find((p) => p.variantId === i.variantId),
			}));
		if (lines.some((l) => l.product === undefined)) return [];
		const itemsTotal = lines.reduce(
			(sum, l) => sum + l.quantity * (l.product as CatalogProduct).price,
			0,
		);
		return [
			{
				id: r.id,
				slug: r.slug,
				isFeatured: r.isFeatured,
				name: text.name,
				description: text.description,
				seoTitle: text.seoTitle,
				seoDescription: text.seoDescription,
				price: r.price,
				itemsTotal,
				saving: itemsTotal - r.price,
				items: lines as { quantity: number; product: CatalogProduct }[],
			},
		];
	});
}

export type CatalogBundle = Awaited<ReturnType<typeof listBundles>>[number];
