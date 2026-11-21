import { and, eq, exists, or } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import { qualified } from "./d1";
import { searchMatch } from "./search-sql";

const { brands, productTranslations, products, variants } = schema;

// For a query that joins products to their default-locale translation and to the brand.
export const productSearch = (db: Db, term: string) =>
	or(
		searchMatch(term, [productTranslations.searchKey, brands.searchKey]),
		exists(
			db
				.select({ id: variants.id })
				.from(variants)
				.where(
					and(
						eq(variants.productId, qualified(products.id)),
						searchMatch(term, [variants.searchKey]),
					),
				),
		),
		searchMatch(term, [products.slug]),
	);
