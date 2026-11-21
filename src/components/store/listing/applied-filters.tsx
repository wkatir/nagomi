import { X } from "lucide-react";
import { StoreButton } from "#/components/store/ui/store-button";
import {
	activeCount,
	clearFilters,
	FACETS,
	type ListingScope,
	type ListingSearch,
	listOf,
	setAvailability,
	setQuery,
	toggle,
} from "#/lib/listing";
import type { ProductPage } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { facetLabel } from "./facet-groups";

// The chips follow `search`, not the data; a value the facets do not know shows its slug.
export function AppliedFilters({
	facets,
	search,
	scope,
	onChange,
}: {
	facets: ProductPage["facets"];
	search: ListingSearch;
	scope: ListingScope;
	onChange: (next: ListingSearch) => void;
}) {
	const chips = [
		...(search.q
			? [
					{
						key: "q",
						name: m.shop_chip_search({ q: search.q }),
						remove: () => onChange(setQuery(search, undefined)),
					},
				]
			: []),
		...FACETS.filter((facet) => scope[facet] === undefined).flatMap((facet) =>
			listOf(search[facet]).map((slug) => ({
				key: `${facet}:${slug}`,
				name: facetLabel(
					facet,
					facets[facet].find((v) => v.slug === slug) ?? { slug, name: slug },
				),
				remove: () => onChange(toggle(search, facet, slug)),
			})),
		),
		...(search.availability
			? [
					{
						key: "availability",
						name: m.shop_filter_in_stock(),
						remove: () => onChange(setAvailability(search, false)),
					},
				]
			: []),
	];
	if (chips.length === 0) return null;
	return (
		<section aria-label={m.shop_applied()} className="mt-5">
			<ul className="flex flex-wrap items-center gap-2">
				{chips.map((chip) => (
					<li key={chip.key}>
						<StoreButton
							variant="outline"
							onClick={chip.remove}
							aria-label={m.shop_remove_filter({ name: chip.name })}
							className="gap-2 px-3 type-small font-medium"
						>
							{chip.name}
							<X aria-hidden strokeWidth={1.5} className="size-4" />
						</StoreButton>
					</li>
				))}
				{activeCount(search) > 1 && (
					<li>
						<StoreButton
							variant="link"
							onClick={() => onChange(clearFilters(search))}
							className="type-small font-medium"
						>
							{m.shop_clear_all()}
						</StoreButton>
					</li>
				)}
			</ul>
		</section>
	);
}
