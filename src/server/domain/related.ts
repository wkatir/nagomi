import { availabilityOf, type CatalogEntry } from "./catalog-query";

export type Relation = "alternative" | "complement";

// At most `perCategory` per category while others are left, so the list spans the setup.
export function relatedProducts(
	product: CatalogEntry,
	entries: CatalogEntry[],
	limit = 8,
	perCategory = 2,
): { entry: CatalogEntry; relation: Relation }[] {
	const scored = entries
		.filter((e) => e.id !== product.id)
		.map((entry) => {
			const sameCategory = entry.category.slug === product.category.slug;
			const score =
				(entry.bundles.some((r) => product.bundles.includes(r)) ? 4 : 0) +
				(sameCategory ? 2 : 1) +
				(entry.brand.slug === product.brand.slug ? 1 : 0);
			return {
				entry,
				score,
				relation: (sameCategory ? "alternative" : "complement") as Relation,
			};
		})
		.filter((s) => s.score > 0)
		.sort(
			(a, b) =>
				b.score - a.score ||
				Number(availabilityOf(a.entry) === "sold_out") -
					Number(availabilityOf(b.entry) === "sold_out") ||
				a.entry.category.sortOrder - b.entry.category.sortOrder ||
				a.entry.name.localeCompare(b.entry.name) ||
				a.entry.id - b.entry.id,
		);
	const perCategoryCount = new Map<string, number>();
	const first: typeof scored = [];
	const rest: typeof scored = [];
	for (const s of scored) {
		const n = perCategoryCount.get(s.entry.category.slug) ?? 0;
		if (n < perCategory) {
			perCategoryCount.set(s.entry.category.slug, n + 1);
			first.push(s);
		} else rest.push(s);
	}
	return [...first, ...rest]
		.slice(0, limit)
		.map(({ entry, relation }) => ({ entry, relation }));
}
