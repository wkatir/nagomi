import { and, asc, count, eq, type SQL, sql } from "drizzle-orm";
import type { Db } from "#/db";
import {
	brands,
	categories,
	collectionProducts,
	collections,
	concerns,
	productConcerns,
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
) => {
	const text = (l: string) =>
		sql`(select t.${sql.raw(column)} from ${sql.raw(table)} t where t.${sql.raw(key)} = ${id} and t.locale = ${l})`;
	return sql<string | null>`coalesce(${text(locale)}, ${text(fallback)})`.as(
		"name",
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
	const [categoryRows, concernRows, brandRows, collectionRows] = await db.batch(
		[
			db
				.select({
					slug: categories.slug,
					routineStep: categories.routineStep,
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
				.select({
					slug: concerns.slug,
					name: localizedName(
						"concern_translations",
						"concern_id",
						"name",
						qualified(concerns.id),
						context,
					),
					productCount,
				})
				.from(concerns)
				.innerJoin(productConcerns, eq(productConcerns.concernId, concerns.id))
				.innerJoin(
					products,
					and(eq(products.id, productConcerns.productId), published),
				)
				.where(eq(concerns.status, "active"))
				.groupBy(concerns.id)
				.orderBy(asc(concerns.position), asc(concerns.id)),
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
		],
	);
	const collator = new Intl.Collator(context.locale, { sensitivity: "base" });
	return {
		categories: named(
			[...categoryRows].sort(
				(a, b) =>
					a.routineStep - b.routineStep ||
					collator.compare(a.name ?? "", b.name ?? ""),
			),
			"Category",
			context,
		),
		concerns: named(concernRows, "Concern", context),
		brands: [...brandRows].sort((a, b) => collator.compare(a.name, b.name)),
		collections: named(collectionRows, "Collection", context),
	};
}
