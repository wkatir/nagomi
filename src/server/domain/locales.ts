import { and, eq, notExists, or, sql } from "drizzle-orm";
import type { Db } from "#/db";
import type { Locale } from "#/db/schema";
import * as schema from "#/db/schema";
import { qualified } from "./d1";

const {
	categories,
	categoryTranslations,
	pages,
	pageVersions,
	productImages,
	productImageTranslations,
	products,
	productTranslations,
	bundles,
	bundleTranslations,
	shippingZones,
	shippingZoneTranslations,
	storePromises,
	storePromiseTranslations,
} = schema;

// Includes archived categories a published product still uses. The default
// locale is the fallback of every text, so it must cover them all.
export async function untranslated(db: Db, locale: Locale) {
	const missing = (type: string) => (rows: { slug: string }[]) =>
		rows.map((r) => ({ type, slug: r.slug }));
	const usedByPublished = (
		link: ReturnType<typeof sql>,
	): ReturnType<typeof sql> =>
		sql`exists (select 1 from ${products} where ${products.status} = 'published' and ${link})`;
	const results = await Promise.all([
		db
			.select({ slug: products.slug })
			.from(products)
			.where(
				and(
					eq(products.status, "published"),
					notExists(
						db
							.select()
							.from(productTranslations)
							.where(
								and(
									eq(productTranslations.productId, qualified(products.id)),
									eq(productTranslations.locale, locale),
								),
							),
					),
				),
			)
			.then(missing("product")),
		db
			.select({ slug: storePromises.slug })
			.from(storePromises)
			.where(
				and(
					eq(storePromises.isPublished, true),
					notExists(
						db
							.select()
							.from(storePromiseTranslations)
							.where(
								and(
									eq(
										storePromiseTranslations.promiseId,
										qualified(storePromises.id),
									),
									eq(storePromiseTranslations.locale, locale),
								),
							),
					),
				),
			)
			.then(missing("promise")),
		db
			.select({ slug: pages.slug })
			.from(pages)
			.where(
				and(
					eq(pages.isPublished, true),
					notExists(
						db
							.select()
							.from(pageVersions)
							.where(
								and(
									eq(pageVersions.pageId, qualified(pages.id)),
									eq(pageVersions.locale, locale),
								),
							),
					),
				),
			)
			.then(missing("page")),
		db
			.select({ slug: bundles.slug })
			.from(bundles)
			.where(
				and(
					eq(bundles.status, "published"),
					notExists(
						db
							.select()
							.from(bundleTranslations)
							.where(
								and(
									eq(bundleTranslations.bundleId, qualified(bundles.id)),
									eq(bundleTranslations.locale, locale),
								),
							),
					),
				),
			)
			.then(missing("bundle")),
		db
			.select({ slug: shippingZones.slug })
			.from(shippingZones)
			.where(
				and(
					eq(shippingZones.status, "active"),
					notExists(
						db
							.select()
							.from(shippingZoneTranslations)
							.where(
								and(
									eq(
										shippingZoneTranslations.zoneId,
										qualified(shippingZones.id),
									),
									eq(shippingZoneTranslations.locale, locale),
								),
							),
					),
				),
			)
			.then(missing("shipping_zone")),
		db
			.select({ slug: categories.slug })
			.from(categories)
			.where(
				and(
					or(
						eq(categories.status, "active"),
						usedByPublished(sql`"products"."category_id" = "categories"."id"`),
					),
					notExists(
						db
							.select()
							.from(categoryTranslations)
							.where(
								and(
									eq(categoryTranslations.categoryId, qualified(categories.id)),
									eq(categoryTranslations.locale, locale),
								),
							),
					),
				),
			)
			.then(missing("category")),
		db
			.select({ slug: products.slug })
			.from(productImages)
			.innerJoin(products, eq(products.id, productImages.productId))
			.where(
				and(
					eq(products.status, "published"),
					eq(productImages.status, "active"),
					notExists(
						db
							.select()
							.from(productImageTranslations)
							.where(
								and(
									eq(
										productImageTranslations.imageId,
										qualified(productImages.id),
									),
									eq(productImageTranslations.locale, locale),
								),
							),
					),
				),
			)
			.then(missing("image_alt")),
	]);
	return results.flat();
}
