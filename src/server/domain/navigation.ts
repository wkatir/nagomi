import { and, asc, count, eq, type SQL, sql } from "drizzle-orm";
import type { Db } from "#/db";
import {
	brands,
	categories,
	collectionProducts,
	collections,
	products,
} from "#/db/schema";
import type { CatalogContext } from "./catalog";
import { qualified } from "./d1";

export type MenuEntry = { slug: string; name: string; productCount: number };

const published = eq(products.status, "published");
const productCount = count(products.id).as("product_count");

const localizedName = (
	table: string,
	key: string,
	column: string,
	id: SQL,
	{ locale, fallback }: CatalogContext,
	as = "name",
) => {
	const text = (l: string) =>
		sql`(select t.${sql.raw(column)} from ${sql.raw(table)} t where t.${sql.raw(key)} = ${id} and t.locale = ${l})`;
	return sql<string | null>`coalesce(${text(locale)}, ${text(fallback)})`.as(
		as,
	);
};

const named = (
	rows: { slug: string; name: string | null; productCount: number }[],
	what: string,
	{ locale, fallback }: CatalogContext,
): MenuEntry[] =>
	rows.map(({ slug, name, productCount }) => {
		if (name === null)
			throw new Error(
				`${what} ${slug} has no text in ${locale} or ${fallback}`,
			);
		return { slug, name, productCount };
	});

// The same values and counts as the unrefined facets of GET /products, counted in SQL
// instead of reading the whole catalogue: the header is on every page.
export async function storeNavigation(db: Db, context: CatalogContext) {
	const [categoryRows, brandRows, collectionRows] = await db.batch([
		db
			.select({
				slug: categories.slug,
				sortOrder: categories.sortOrder,
				icon: categories.icon,
				subtitle: localizedName(
					"category_translations",
					"category_id",
					"subtitle",
					qualified(categories.id),
					context,
					"subtitle",
				),
				name: localizedName(
					"category_translations",
					"category_id",
					"name",
					qualified(categories.id),
					context,
				),
				productCount,
			})
			.from(categories)
			.innerJoin(
				products,
				and(eq(products.categoryId, categories.id), published),
			)
			.groupBy(categories.id),
		db
			.select({ slug: brands.slug, name: brands.name, productCount })
			.from(brands)
			.innerJoin(products, and(eq(products.brandId, brands.id), published))
			.groupBy(brands.id),
		db
			.select({
				slug: collections.slug,
				name: localizedName(
					"collection_translations",
					"collection_id",
					"title",
					qualified(collections.id),
					context,
				),
				productCount,
			})
			.from(collections)
			.innerJoin(
				collectionProducts,
				eq(collectionProducts.collectionId, collections.id),
			)
			.innerJoin(
				products,
				and(eq(products.id, collectionProducts.productId), published),
			)
			.where(eq(collections.status, "published"))
			.groupBy(collections.id)
			.orderBy(asc(collections.position), asc(collections.id)),
	]);
	const collator = new Intl.Collator(context.locale, { sensitivity: "base" });
	return {
		categories: [...categoryRows]
			.sort(
				(a, b) =>
					a.sortOrder - b.sortOrder ||
					collator.compare(a.name ?? "", b.name ?? ""),
			)
			.map(({ slug, name, productCount, icon, subtitle }) => {
				if (name === null)
					throw new Error(
						`Category ${slug} has no text in ${context.locale} or ${context.fallback}`,
					);
				return { slug, name, productCount, icon, subtitle };
			}),
		brands: [...brandRows].sort((a, b) => collator.compare(a.name, b.name)),
		collections: named(collectionRows, "Collection", context),
	};
}
