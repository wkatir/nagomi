import { and, asc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import { type Locale, SKIN_TYPES } from "#/db/schema";
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
	concerns,
	concernTranslations,
	inventoryMovements,
	lots,
	mediaFiles,
	orderItems,
	orders,
	productConcerns,
	productImages,
	productImageTranslations,
	productSkinTypes,
	products,
	productTranslations,
	routineItems,
	routines,
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

export type VisibleRoutine = {
	id: number;
	slug: string;
	isFeatured: boolean;
	concern: string | null;
	steps: { sku: string; productId: number }[];
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
		tags,
		concernTexts,
		memberships,
		collectionRows,
		collectionTexts,
		photos,
		alts,
		routineRows,
		skinTypeRows,
	] = await db.batch([
		// Column names must be unique within a batched select: D1 returns batch rows as
		// objects keyed by name, so drizzle would misplace a repeated one.
		db
			.select({
				id: products.id,
				slug: products.slug,
				createdAt: products.createdAt,
				brand: {
					slug: sql<string>`${brands.slug}`.as("brand_slug"),
					name: brands.name,
				},
				categoryId: products.categoryId,
				categorySlug: sql<string>`${categories.slug}`.as("category_slug"),
				routineStep: categories.routineStep,
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
				keyIngredients: productTranslations.keyIngredients,
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
				sizeValue: variants.sizeValue,
				sizeUnit: variants.sizeUnit,
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
			.where(and(published, gte(lots.expiresOn, context.today)))
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
				productId: productConcerns.productId,
				id: concerns.id,
				slug: concerns.slug,
				position: concerns.position,
			})
			.from(productConcerns)
			.innerJoin(concerns, eq(concerns.id, productConcerns.concernId))
			.innerJoin(products, eq(products.id, productConcerns.productId))
			.where(and(published, eq(concerns.status, "active")))
			.orderBy(asc(concerns.position), asc(concerns.id)),
		db
			.select()
			.from(concernTranslations)
			.where(inArray(concernTranslations.locale, locales)),
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
				id: routines.id,
				slug: routines.slug,
				isFeatured: routines.isFeatured,
				concern: sql<string | null>`${concerns.slug}`.as(
					"routine_concern_slug",
				),
				variantId: routineItems.variantId,
			})
			.from(routines)
			.innerJoin(routineItems, eq(routineItems.routineId, routines.id))
			.leftJoin(
				concerns,
				and(eq(concerns.id, routines.concernId), eq(concerns.status, "active")),
			)
			.where(eq(routines.status, "published"))
			.orderBy(
				asc(routines.position),
				asc(routines.id),
				asc(routineItems.position),
			),
		db
			.select({
				productId: productSkinTypes.productId,
				skinType: productSkinTypes.skinType,
			})
			.from(productSkinTypes)
			.innerJoin(products, eq(products.id, productSkinTypes.productId))
			.where(published),
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
	const concernName = (id: number, slug: string) =>
		named(
			concernTexts.filter((t) => t.concernId === id),
			`Concern ${slug}`,
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
	const tagsOf = groupBy(tags, (t) => t.productId);
	const membershipsOf = groupBy(memberships, (m) => m.productId);
	const skinTypesOf = groupBy(skinTypeRows, (s) => s.productId);
	const photosOf = groupBy(photos, (p) => p.productId);
	const altsOf = groupBy(alts, (a) => a.imageId);
	const collectionById = new Map(collectionRows.map((c) => [c.id, c]));

	const productOfVariant = new Map(sizes.map((v) => [v.id, v]));
	const visibleRoutines: VisibleRoutine[] = [
		...groupBy(routineRows, (r) => r.id).values(),
	].flatMap((items) => {
		const [first] = items;
		const steps = items.map((i) => productOfVariant.get(i.variantId));
		if (steps.some((s) => s === undefined)) return [];
		return [
			{
				id: first.id,
				slug: first.slug,
				isFeatured: first.isFeatured,
				concern: first.concern,
				steps: (steps as typeof sizes).map((s) => ({
					sku: s.sku,
					productId: s.productId,
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
				size:
					v.sizeValue !== null && v.sizeUnit !== null
						? { value: v.sizeValue, unit: v.sizeUnit }
						: null,
				price: v.price as number,
				compareAtPrice: v.compareAtPrice,
				availability: unitsAvailability(sellable),
				maxQuantity: lineMax(sellable, context.maxQuantityPerLine),
			};
		});
		const [cheapest, ...others] = variantsForSale;
		if (!cheapest)
			throw new Error(`Published product ${p.slug} has no active priced size`);
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
		const productConcernsNamed = (tagsOf.get(p.id) ?? []).map((t) => ({
			slug: t.slug,
			name: concernName(t.id, t.slug),
		}));
		const category = {
			slug: p.categorySlug,
			name: categoryName(p.categoryId, p.categorySlug),
			routineStep: p.routineStep,
		};
		return [
			{
				id: p.id,
				slug: p.slug,
				name: text.name,
				tagline: text.tagline,
				brand: p.brand,
				category,
				concerns: productConcernsNamed,
				skinTypes: SKIN_TYPES.filter((s) =>
					(skinTypesOf.get(p.id) ?? []).some((r) => r.skinType === s),
				),
				collections: (membershipsOf.get(p.id) ?? []).map((m) => {
					const collection = collectionById.get(m.collectionId);
					if (!collection)
						throw new Error(`Collection ${m.collectionId} is not published`);
					return { slug: collection.slug, position: m.position };
				}),
				routines: visibleRoutines
					.filter((r) => r.steps.some((s) => s.productId === p.id))
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
					...productConcernsNamed.map((c) => c.name),
					text.keyIngredients,
					...variantsForSale.map((v) => v.sku),
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
				(a, b) =>
					a.routineStep - b.routineStep || collator.compare(a.name, b.name),
			)
			.map(({ slug, name }) => ({ slug, name })),
		concern: unique(
			tags.map((t) => ({
				slug: t.slug,
				name: concernName(t.id, t.slug),
				position: t.position,
			})),
		)
			.sort((a, b) => a.position - b.position)
			.map(({ slug, name }) => ({ slug, name })),
		// The name is the value itself, which the page translates.
		skinType: SKIN_TYPES.map((s): Named => ({ slug: s, name: s })),
		brand: unique(entries.map((e) => e.brand)).sort((a, b) =>
			collator.compare(a.name, b.name),
		),
		collection: collectionRows.map(
			(c): Named => ({ slug: c.slug, name: collectionTitle(c.id, c.slug) }),
		),
	};
	return { entries, dimensions, routines: visibleRoutines };
}

export type LoadedCatalog = Awaited<ReturnType<typeof loadCatalog>>;
