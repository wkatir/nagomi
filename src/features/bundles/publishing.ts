import type { Locale } from "#/lib/enums";
import { BUNDLE_MIN_ITEMS } from "#/lib/schemas/bundles";
import { m } from "#/paraglide/messages";
import type { BundleDetail } from "./queries";

// Mirrors the API's publishing rules.
export function missingToPublish(
	bundle: Pick<BundleDetail, "translations" | "items">,
	defaultLocale: Locale,
) {
	const missing: ("title" | "steps")[] = [];
	if (!bundle.translations.some((t) => t.locale === defaultLocale))
		missing.push("title");
	if (bundle.items.length < BUNDLE_MIN_ITEMS) missing.push("steps");
	return missing;
}

export const missingLabel = {
	title: m.admin_merch_needs_title,
	steps: m.admin_bundle_needs_items,
} as const;
