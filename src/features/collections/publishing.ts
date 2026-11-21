import type { Locale } from "#/lib/enums";
import { m } from "#/paraglide/messages";
import type { CollectionDetail } from "./queries";

// Mirrors the API's publishing rules.
export function missingToPublish(
	collection: Pick<CollectionDetail, "translations" | "products">,
	defaultLocale: Locale,
) {
	const missing: ("title" | "products")[] = [];
	if (!collection.translations.some((t) => t.locale === defaultLocale))
		missing.push("title");
	if (collection.products.length === 0) missing.push("products");
	return missing;
}

export const missingLabel = {
	title: m.admin_merch_needs_title,
	products: m.admin_collection_needs_products,
} as const;
