import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import type { Locale } from "#/db/schema";
import { inList } from "./d1";
import { mediaUrl } from "./images";
import { committedByVariant, onHandByVariant } from "./inventory";
import { productPhotoColumns } from "./product-photos";
import { lineMax, sellableUnits, unitsAvailability } from "./stock";

const {
	brands,
	categories,
	categoryTranslations,
	concerns,
	concernTranslations,
	mediaFiles,
	productConcerns,
	productImages,
	productImageTranslations,
	products,
	productTranslations,
	routineItems,
	routines,
	routineTranslations,
	variants,
} = schema;

// `fallback` is the store default locale; `holdStart` the first instant a pending order
// still holds stock (stock.ts).
export type CatalogContext = {
	locale: Locale;
	fallback: Locale;
	today: string;
	holdStart: string;
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
	{ locale, fallback, today, holdStart, maxQuantityPerLine }: CatalogContext,
	filter?: { slugs?: string[]; variantIds?: number[]; skus?: string[] },
) {
	const rows = await db
		.select({
			productId: products.id,
			slug: products.slug,
			inci: products.inci,
			sanitaryRegistration: products.sanitaryRegistration,
			brand: brands.name,
			categoryId: categories.id,
			categorySlug: categories.slug,
			routineStep: categories.routineStep,
			variantId: variants.id,
			sku: variants.sku,
			sizeValue: variants.sizeValue,
			sizeUnit: variants.sizeUnit,
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
		.orderBy(asc(categories.routineStep), asc(products.slug));
	if (rows.length === 0) return [];

	const productIds = [...new Set(rows.map((r) => r.productId))];
	const categoryIds = [...new Set(rows.map((r) => r.categoryId))];
	const variantIds = rows.map((r) => r.variantId);
	const [texts, categoryTexts, images, tags, stock, promised] =
		await Promise.all([
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
			db
				.select({ productId: productConcerns.productId, slug: concerns.slug })
				.from(productConcerns)
				.innerJoin(concerns, eq(concerns.id, productConcerns.concernId))
				.where(
					and(
						inList(productConcerns.productId, productIds),
						eq(concerns.status, "active"),
					),
				),
			onHandByVariant(db, today, variantIds),
			committedByVariant(db, holdStart, variantIds),
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
	const committed = new Map(promised.map((s) => [s.variantId, s.committed]));
	const list = rows.map((r) => {
		const sellable = sellableUnits(
			onHand.get(r.variantId) ?? 0,
			committed.get(r.variantId) ?? 0,
		);
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
			description: text.description,
			howToUse: text.howToUse,
			keyIngredients: text.keyIngredients,
			seoTitle: text.seoTitle,
			seoDescription: text.seoDescription,
			inci: r.inci,
			sanitaryRegistration: r.sanitaryRegistration,
			category: {
				slug: r.categorySlug,
				routineStep: r.routineStep,
				name: categoryText.name,
			},
			size:
				r.sizeValue && r.sizeUnit
					? { value: r.sizeValue, unit: r.sizeUnit }
					: null,
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
			concerns: tags
				.filter((t) => t.productId === r.productId)
				.map((t) => t.slug),
			variantId: r.variantId,
		};
	});
	// Stable sort: sold out last, otherwise in routine order.
	return list.sort(
		(a, b) =>
			Number(a.availability === "sold_out") -
			Number(b.availability === "sold_out"),
	);
}

export type CatalogProduct = Awaited<ReturnType<typeof listCatalog>>[number];

export async function listConcerns(db: Db, locale: Locale, fallback: Locale) {
	const [rows, texts] = await Promise.all([
		db
			.select()
			.from(concerns)
			.where(eq(concerns.status, "active"))
			.orderBy(asc(concerns.position)),
		db.select().from(concernTranslations),
	]);
	return rows.map((c) => {
		const text = pickLocale(
			texts.filter((t) => t.concernId === c.id),
			locale,
			fallback,
		);
		if (!text)
			throw new Error(
				`Concern ${c.slug} has no translation for ${locale} or ${fallback}`,
			);
		return { slug: c.slug, name: text.name };
	});
}

export async function listRoutines(db: Db, context: CatalogContext) {
	const { locale, fallback } = context;
	const rs = await db
		.select()
		.from(routines)
		.where(eq(routines.status, "published"))
		.orderBy(asc(routines.position));
	if (rs.length === 0) return [];
	const ids = rs.map((r) => r.id);
	const [texts, items] = await Promise.all([
		db
			.select()
			.from(routineTranslations)
			.where(inList(routineTranslations.routineId, ids)),
		db
			.select()
			.from(routineItems)
			.where(inList(routineItems.routineId, ids))
			.orderBy(asc(routineItems.position)),
	]);
	const products = await listCatalog(db, context, {
		variantIds: [...new Set(items.map((i) => i.variantId))],
	});
	return rs.flatMap((r) => {
		const text = pickLocale(
			texts.filter((t) => t.routineId === r.id),
			locale,
			fallback,
		);
		if (!text)
			throw new Error(
				`Routine ${r.slug} has no translation for ${locale} or ${fallback}`,
			);
		const steps = items
			.filter((i) => i.routineId === r.id)
			.map((i) => products.find((p) => p.variantId === i.variantId));
		if (steps.some((s) => s === undefined)) return [];
		return [
			{
				slug: r.slug,
				isFeatured: r.isFeatured,
				title: text.title,
				description: text.description,
				seoTitle: text.seoTitle,
				seoDescription: text.seoDescription,
				products: steps as CatalogProduct[],
			},
		];
	});
}
