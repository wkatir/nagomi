import { and, asc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { Hono } from "hono";
import { z } from "zod";
import { type Db, getDb, schema } from "#/db";
import { type Locale, SLUG_REGEX } from "#/db/schema";
import { withinDays } from "#/lib/dates";
import { localeQuery, validate } from "#/server/validate";
import { type CatalogContext, listSpecs, pickLocale } from "../domain/catalog";
import {
	AVAILABILITIES,
	availabilityOf,
	CATALOG_SORTS,
	type CatalogImage,
	queryCatalog,
	sortEntries,
	toCard,
} from "../domain/catalog-query";
import { inList, qualified } from "../domain/d1";
import { mediaUrl } from "../domain/images";
import { storeNavigation } from "../domain/navigation";
import { publishedPromises } from "../domain/promises";
import { relatedProducts } from "../domain/related";
import { getSettings } from "../domain/settings";
import {
	catalogContext,
	type LoadedCatalog,
	loadCatalog,
	localesOf,
	mediaImage,
	textOf,
	type VisibleBundle,
} from "../domain/storefront-catalog";

const {
	brands,
	brandTranslations,
	categories,
	categoryTranslations,
	collectionProducts,
	collections,
	collectionTranslations,
	homeSlides,
	homeSlideTranslations,
	mediaFiles,
	productImages,
	productImageTranslations,
	products,
	productTranslations,
	bundleTranslations,
	variants,
} = schema;

// Any text: a slug that cannot exist is just not found.
const slugParam = z.object({ slug: z.string().max(200) });

const repeated = <T extends z.ZodType<unknown, string>>(item: T, max = 20) =>
	z
		.union([z.string(), z.array(z.string())])
		.optional()
		.transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))
		.pipe(z.array(item).max(max));
const slugList = repeated(z.string().regex(SLUG_REGEX).max(80));
const minorUnits = z.coerce.number().int().min(0).max(100_000_000);

const productsQuery = localeQuery
	.extend({
		q: z.string().trim().max(80).optional(),
		slug: repeated(z.string().regex(SLUG_REGEX).max(80), 60),
		category: slugList,
		brand: slugList,
		collection: slugList,
		minPrice: minorUnits.optional(),
		maxPrice: minorUnits.optional(),
		availability: z.enum(AVAILABILITIES).optional(),
		sort: z.enum(CATALOG_SORTS).default("featured"),
		page: z.coerce.number().int().min(1).max(1000).default(1),
		pageSize: z.coerce.number().int().min(1).max(60).default(24),
	})
	.refine(
		(q) =>
			q.minPrice === undefined ||
			q.maxPrice === undefined ||
			q.minPrice <= q.maxPrice,
		{ message: "minPrice is above maxPrice", path: ["maxPrice"] },
	);

const HOME_COLLECTION_PRODUCTS = 8;

async function context(db: Db, locale: Locale) {
	const settings = await getSettings(db);
	return { settings, context: catalogContext(settings, locale) };
}

function bundleTexts(db: Db, ids: number[], c: CatalogContext) {
	return db
		.select()
		.from(bundleTranslations)
		.where(
			and(
				inList(bundleTranslations.bundleId, ids),
				inArray(bundleTranslations.locale, localesOf(c)),
			),
		);
}

function bundleView(
	bundle: VisibleBundle,
	texts: (typeof bundleTranslations.$inferSelect)[],
	catalog: LoadedCatalog,
	c: CatalogContext,
) {
	const text = textOf(
		texts.filter((t) => t.bundleId === bundle.id),
		c,
		`Bundle ${bundle.slug}`,
	);
	const items = bundle.items.map((item, index) => {
		const entry = catalog.entries.find((e) => e.id === item.productId);
		const variant = entry?.variants.find((v) => v.sku === item.sku);
		if (!entry || !variant)
			throw new Error(`Bundle ${bundle.slug}: ${item.sku} is not for sale`);
		return {
			position: index + 1,
			quantity: item.quantity,
			...variant,
			product: toCard(entry),
		};
	});
	const itemsTotal = items.reduce((n, i) => n + i.quantity * i.price, 0);
	return {
		slug: bundle.slug,
		isFeatured: bundle.isFeatured,
		name: text.name,
		description: text.description,
		seoTitle: text.seoTitle,
		seoDescription: text.seoDescription,
		items,
		price: bundle.price,
		itemsTotal,
		saving: itemsTotal - bundle.price,
		availability: items.every((i) => i.availability === "in_stock")
			? ("in_stock" as const)
			: ("sold_out" as const),
	};
}

async function publishedCollections(db: Db, c: CatalogContext) {
	const [rows, texts] = await db.batch([
		db
			.select({
				id: collections.id,
				slug: collections.slug,
				showOnHome: collections.showOnHome,
				coverKey: mediaFiles.r2Key,
				coverWidth: mediaFiles.width,
				coverHeight: mediaFiles.height,
				productCount: sql<number>`(select count(*) from ${collectionProducts} cp join ${products} p on p.id = cp.product_id where cp.collection_id = ${qualified(collections.id)} and p.status = 'published')`,
			})
			.from(collections)
			.leftJoin(mediaFiles, eq(mediaFiles.id, collections.coverMediaId))
			.where(eq(collections.status, "published"))
			.orderBy(asc(collections.position), asc(collections.id)),
		db
			.select(getTableColumns(collectionTranslations))
			.from(collectionTranslations)
			.innerJoin(
				collections,
				eq(collections.id, collectionTranslations.collectionId),
			)
			.where(
				and(
					eq(collections.status, "published"),
					inArray(collectionTranslations.locale, localesOf(c)),
				),
			),
	]);
	return rows.map((r) => {
		const text = textOf(
			texts.filter((t) => t.collectionId === r.id),
			c,
			`Collection ${r.slug}`,
		);
		const image: CatalogImage | null =
			r.coverKey !== null && r.coverWidth !== null && r.coverHeight !== null
				? {
						url: mediaUrl(r.coverKey),
						width: r.coverWidth,
						height: r.coverHeight,
						alt: text.coverAlt ?? text.title,
					}
				: null;
		return {
			slug: r.slug,
			title: text.title,
			description: text.description,
			seoTitle: text.seoTitle,
			seoDescription: text.seoDescription,
			showOnHome: r.showOnHome,
			image,
			productCount: r.productCount,
		};
	});
}

const collectionEntries = (
	catalog: LoadedCatalog,
	slug: string,
	locale: Locale,
) =>
	sortEntries(
		catalog.entries.filter((e) => e.collections.some((x) => x.slug === slug)),
		locale,
		"featured",
		[slug],
	);

async function activeBrands(db: Db, c: CatalogContext) {
	const [rows, texts] = await db.batch([
		db
			.select({
				id: brands.id,
				slug: brands.slug,
				name: brands.name,
				countryCode: brands.countryCode,
				productCount: sql<number>`(select count(*) from ${products} p where p.brand_id = ${qualified(brands.id)} and p.status = 'published')`,
			})
			.from(brands)
			.where(eq(brands.status, "active"))
			.orderBy(asc(brands.name)),
		db
			.select()
			.from(brandTranslations)
			.where(inArray(brandTranslations.locale, localesOf(c))),
	]);
	return rows.map(({ id, ...brand }) => {
		const text = pickLocale(
			texts.filter((t) => t.brandId === id),
			c.locale,
			c.fallback,
		);
		return {
			...brand,
			description: text?.description ?? null,
			seoTitle: text?.seoTitle ?? null,
			seoDescription: text?.seoDescription ?? null,
		};
	});
}

export const storeCatalog = new Hono()
	.get("/home", validate("query", localeQuery), async (c) => {
		const db = getDb();
		const { locale } = c.req.valid("query");
		const { settings, context: ctx } = await context(db, locale);
		const desktop = alias(mediaFiles, "desktop");
		const mobile = alias(mediaFiles, "mobile");
		const [catalog, [slides, slideTexts], collectionList, promises] =
			await Promise.all([
				loadCatalog(db, ctx),
				db.batch([
					db
						.select({
							id: homeSlides.id,
							linkPath: homeSlides.linkPath,
							startsOn: homeSlides.startsOn,
							endsOn: homeSlides.endsOn,
							// Unique column names: see loadCatalog.
							desktop: {
								r2Key: sql<string>`${desktop.r2Key}`.as("desktop_key"),
								width: sql<number>`${desktop.width}`.as("desktop_width"),
								height: sql<number>`${desktop.height}`.as("desktop_height"),
							},
							mobileKey: sql<string | null>`${mobile.r2Key}`.as("mobile_key"),
							mobileWidth: sql<number | null>`${mobile.width}`.as(
								"mobile_width",
							),
							mobileHeight: sql<number | null>`${mobile.height}`.as(
								"mobile_height",
							),
						})
						.from(homeSlides)
						.innerJoin(desktop, eq(desktop.id, homeSlides.desktopMediaId))
						.leftJoin(mobile, eq(mobile.id, homeSlides.mobileMediaId))
						.where(eq(homeSlides.status, "published"))
						.orderBy(asc(homeSlides.position), asc(homeSlides.id)),
					db
						.select(getTableColumns(homeSlideTranslations))
						.from(homeSlideTranslations)
						.innerJoin(
							homeSlides,
							eq(homeSlides.id, homeSlideTranslations.slideId),
						)
						.where(
							and(
								eq(homeSlides.status, "published"),
								inArray(homeSlideTranslations.locale, localesOf(ctx)),
							),
						),
				]),
				publishedCollections(db, ctx),
				publishedPromises(db, settings),
			]);
		const featuredBundles = catalog.bundles.filter((r) => r.isFeatured);
		const featuredTexts = await bundleTexts(
			db,
			featuredBundles.map((b) => b.id),
			ctx,
		);
		const ordered = sortEntries(catalog.entries, locale);
		return c.json({
			slides: slides
				.filter((s) => withinDays(ctx.today, s.startsOn, s.endsOn))
				.map((s) => {
					const text = textOf(
						slideTexts.filter((t) => t.slideId === s.id),
						ctx,
						`Home slide ${s.id}`,
					);
					return {
						id: s.id,
						title: text.title,
						body: text.body,
						ctaLabel: text.ctaLabel,
						linkPath: s.linkPath,
						image: mediaImage(s.desktop, text.imageAlt),
						mobileImage:
							s.mobileKey !== null &&
							s.mobileWidth !== null &&
							s.mobileHeight !== null
								? mediaImage(
										{
											r2Key: s.mobileKey,
											width: s.mobileWidth,
											height: s.mobileHeight,
										},
										text.imageAlt,
									)
								: null,
					};
				}),
			collections: collectionList
				.filter((x) => x.showOnHome && x.productCount > 0)
				.map((x) => ({
					...x,
					products: collectionEntries(catalog, x.slug, locale)
						.slice(0, HOME_COLLECTION_PRODUCTS)
						.map(toCard),
				})),
			featuredBundles: featuredBundles.map((b) =>
				bundleView(b, featuredTexts, catalog, ctx),
			),
			featuredProducts: ordered.filter((e) => e.isFeatured).map(toCard),
			categories: catalog.dimensions.category.map((category) => {
				const inCategory = ordered.filter(
					(e) => e.category.slug === category.slug,
				);
				return {
					...category,
					productCount: inCategory.length,
					image: inCategory.find((e) => e.packshot)?.packshot ?? null,
				};
			}),
			promises: promises[locale],
		});
	})
	// Prices are in minor units.
	.get("/products", validate("query", productsQuery), async (c) => {
		const db = getDb();
		const { locale, ...filter } = c.req.valid("query");
		const { context: ctx } = await context(db, locale);
		const catalog = await loadCatalog(db, ctx);
		return c.json(
			queryCatalog(catalog.entries, catalog.dimensions, filter, locale),
		);
	})
	.get(
		"/products/:slug",
		validate("param", slugParam),
		validate("query", localeQuery),
		async (c) => {
			const db = getDb();
			const { slug } = c.req.valid("param");
			const { locale } = c.req.valid("query");
			const { context: ctx } = await context(db, locale);
			const catalog = await loadCatalog(db, ctx);
			const entry = catalog.entries.find((e) => e.slug === slug);
			if (!entry) return c.json({ error: "not_found" }, 404);
			const inBundles = catalog.bundles.filter((r) =>
				entry.bundles.includes(r.slug),
			);
			const [[product], texts, images, alts, bundleTextRows] = await db.batch([
				db
					.select({
						updatedAt: products.updatedAt,
					})
					.from(products)
					.where(eq(products.id, entry.id)),
				db
					.select()
					.from(productTranslations)
					.where(
						and(
							eq(productTranslations.productId, entry.id),
							inArray(productTranslations.locale, localesOf(ctx)),
						),
					),
				db
					.select({
						id: productImages.id,
						kind: productImages.kind,
						r2Key: mediaFiles.r2Key,
						width: mediaFiles.width,
						height: mediaFiles.height,
						sku: variants.sku,
					})
					.from(productImages)
					.innerJoin(mediaFiles, eq(mediaFiles.id, productImages.mediaFileId))
					.leftJoin(variants, eq(variants.id, productImages.variantId))
					.where(
						and(
							eq(productImages.productId, entry.id),
							eq(productImages.status, "active"),
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
					.where(
						and(
							eq(productImages.productId, entry.id),
							inArray(productImageTranslations.locale, localesOf(ctx)),
						),
					),
				bundleTexts(
					db,
					inBundles.map((r) => r.id),
					ctx,
				),
			]);
			if (!product) return c.json({ error: "not_found" }, 404);
			const specs = await listSpecs(db, entry.id, ctx.locale, ctx.fallback);
			const text = textOf(texts, ctx, `Product ${slug}`);
			const forSale = new Set(entry.variants.map((v) => v.sku));
			const collectionNames = new Map(
				catalog.dimensions.collection.map((x) => [x.slug, x.name]),
			);
			return c.json({
				slug: entry.slug,
				rating: entry.rating,
				name: text.name,
				tagline: text.tagline,
				shortSpecs: text.shortSpecs,
				description: text.description,
				specs,
				warrantyMonths: entry.warrantyMonths,
				isFeatured: entry.isFeatured,
				badge: entry.badge,
				seoTitle: text.seoTitle,
				seoDescription: text.seoDescription,
				brand: entry.brand,
				category: entry.category,
				// Cheapest first; the first is the default variant.
				variants: entry.variants,
				availability: availabilityOf(entry),
				images: images
					.filter((i) => i.sku === null || forSale.has(i.sku))
					.map((i) => ({
						...mediaImage(
							i,
							pickLocale(
								alts.filter((a) => a.imageId === i.id),
								ctx.locale,
								ctx.fallback,
							)?.alt ?? `${entry.brand.name} ${text.name}`,
						),
						kind: i.kind,
						sku: i.sku,
					})),
				bundles: inBundles.map((r) =>
					bundleView(r, bundleTextRows, catalog, ctx),
				),
				collections: entry.collections.map((x) => {
					const name = collectionNames.get(x.slug);
					if (name === undefined)
						throw new Error(
							`Collection ${x.slug} of ${slug} is not in the catalog`,
						);
					return { slug: x.slug, name };
				}),
				related: relatedProducts(entry, catalog.entries).map(
					({ entry: related, relation }) => ({
						...toCard(related),
						relation,
					}),
				),
				createdAt: entry.createdAt,
				updatedAt: product.updatedAt,
			});
		},
	)
	.get("/navigation", validate("query", localeQuery), async (c) => {
		const db = getDb();
		const { locale } = c.req.valid("query");
		const { context: ctx } = await context(db, locale);
		return c.json(await storeNavigation(db, ctx));
	})
	.get(
		"/categories/:slug",
		validate("param", slugParam),
		validate("query", localeQuery),
		async (c) => {
			const db = getDb();
			const { slug } = c.req.valid("param");
			const { locale } = c.req.valid("query");
			const { context: ctx } = await context(db, locale);
			const catalog = await loadCatalog(db, ctx);
			const category = catalog.dimensions.category.find((x) => x.slug === slug);
			if (!category) return c.json({ error: "not_found" }, 404);
			const texts = await db
				.select(getTableColumns(categoryTranslations))
				.from(categoryTranslations)
				.innerJoin(
					categories,
					eq(categories.id, categoryTranslations.categoryId),
				)
				.where(
					and(
						eq(categories.slug, slug),
						inArray(categoryTranslations.locale, localesOf(ctx)),
					),
				);
			const text = textOf(texts, ctx, `Category ${slug}`);
			const [row] = await db
				.select({ icon: categories.icon })
				.from(categories)
				.where(eq(categories.slug, slug));
			if (!row) return c.json({ error: "not_found" }, 404);
			return c.json({
				slug,
				name: category.name,
				subtitle: text.subtitle,
				icon: row.icon,
				description: text.description,
				seoTitle: text.seoTitle,
				seoDescription: text.seoDescription,
				productCount: catalog.entries.filter((e) => e.category.slug === slug)
					.length,
			});
		},
	)
	.get("/brands", validate("query", localeQuery), async (c) => {
		const db = getDb();
		const { locale } = c.req.valid("query");
		const { context: ctx } = await context(db, locale);
		const list = await activeBrands(db, ctx);
		return c.json(list.filter((b) => b.productCount > 0));
	})
	// Like the list and the sitemap, only a brand with a published product has a page.
	.get(
		"/brands/:slug",
		validate("param", slugParam),
		validate("query", localeQuery),
		async (c) => {
			const db = getDb();
			const { slug } = c.req.valid("param");
			const { locale } = c.req.valid("query");
			const { context: ctx } = await context(db, locale);
			const brand = (await activeBrands(db, ctx)).find((b) => b.slug === slug);
			return brand && brand.productCount > 0
				? c.json(brand)
				: c.json({ error: "not_found" }, 404);
		},
	)
	.get("/collections", validate("query", localeQuery), async (c) => {
		const db = getDb();
		const { locale } = c.req.valid("query");
		const { context: ctx } = await context(db, locale);
		const list = await publishedCollections(db, ctx);
		return c.json(list.filter((x) => x.productCount > 0));
	})
	// Like the list and the sitemap, only a collection with a published product has a
	// page.
	.get(
		"/collections/:slug",
		validate("param", slugParam),
		validate("query", localeQuery),
		async (c) => {
			const db = getDb();
			const { slug } = c.req.valid("param");
			const { locale } = c.req.valid("query");
			const { context: ctx } = await context(db, locale);
			const [list, catalog] = await Promise.all([
				publishedCollections(db, ctx),
				loadCatalog(db, ctx),
			]);
			const collection = list.find((x) => x.slug === slug);
			if (!collection || collection.productCount === 0)
				return c.json({ error: "not_found" }, 404);
			return c.json({
				...collection,
				products: collectionEntries(catalog, slug, locale).map(toCard),
			});
		},
	)
	.get("/bundles", validate("query", localeQuery), async (c) => {
		const db = getDb();
		const { locale } = c.req.valid("query");
		const { context: ctx } = await context(db, locale);
		const catalog = await loadCatalog(db, ctx);
		const texts = await bundleTexts(
			db,
			catalog.bundles.map((r) => r.id),
			ctx,
		);
		return c.json(
			catalog.bundles.map((r) => bundleView(r, texts, catalog, ctx)),
		);
	})
	.get(
		"/bundles/:slug",
		validate("param", slugParam),
		validate("query", localeQuery),
		async (c) => {
			const db = getDb();
			const { slug } = c.req.valid("param");
			const { locale } = c.req.valid("query");
			const { context: ctx } = await context(db, locale);
			const catalog = await loadCatalog(db, ctx);
			const bundle = catalog.bundles.find((r) => r.slug === slug);
			if (!bundle) return c.json({ error: "not_found" }, 404);
			const texts = await bundleTexts(db, [bundle.id], ctx);
			return c.json(bundleView(bundle, texts, catalog, ctx));
		},
	);
