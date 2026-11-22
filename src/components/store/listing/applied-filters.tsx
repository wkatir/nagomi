import { X } from "lucide-react";
import { StoreButton } from "#/components/store/ui/store-button";
import { useMoney } from "#/hooks/use-money";
import {
	activeCount,
	clearFilters,
	FACETS,
	type ListingScope,
	type ListingSearch,
	listOf,
	setAvailability,
	setPrice,
	setQuery,
	toggle,
} from "#/lib/listing";
import type { ProductPage } from "#/lib/queries";
import { m } from "#/paraglide/messages";

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
				name: facets[facet].find((v) => v.slug === slug)?.name ?? slug,
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
	const priced = search.minPrice !== undefined || search.maxPrice !== undefined;
	if (chips.length === 0 && !priced) return null;
	return (
		<section aria-label={m.shop_applied()} className="mt-4">
			<ul className="flex flex-wrap items-center gap-2">
				{chips.map((chip) => (
					<li key={chip.key}>
						<Chip name={chip.name} onRemove={chip.remove} />
					</li>
				))}
				{priced && (
					<li>
						<PriceChip
							min={search.minPrice}
							max={search.maxPrice}
							onRemove={() => onChange(setPrice(search, undefined, undefined))}
						/>
					</li>
				)}
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

function Chip({ name, onRemove }: { name: string; onRemove: () => void }) {
	return (
		<StoreButton
			variant="outline"
			size="sm"
			onClick={onRemove}
			aria-label={m.shop_remove_filter({ name })}
			className="gap-2 px-3 font-medium"
		>
			{name}
			<X aria-hidden className="size-4" />
		</StoreButton>
	);
}

function PriceChip({
	min,
	max,
	onRemove,
}: {
	min: number | undefined;
	max: number | undefined;
	onRemove: () => void;
}) {
	const money = useMoney();
	const name =
		min !== undefined && max !== undefined
			? m.shop_price_between({ min: money(min), max: money(max) })
			: min !== undefined
				? m.shop_price_from({ min: money(min) })
				: m.shop_price_up_to({ max: money(max ?? 0) });
	return <Chip name={name} onRemove={onRemove} />;
}
