import { useSuspenseQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { ProductCard } from "#/components/store/product-card";
import { EmptyState } from "#/components/store/ui/empty-state";
import { StoreButton } from "#/components/store/ui/store-button";
import {
	StoreSheetContent,
	StoreSheetHeader,
} from "#/components/store/ui/store-sheet";
import { Sheet, SheetClose, SheetTrigger } from "#/components/ui/sheet";
import {
	activeCount,
	clearFilters,
	type ListingScope,
	type ListingSearch,
	listingFilter,
	pagesOf,
	SORTS,
	setSort,
	showMore,
} from "#/lib/listing";
import { productPageQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";
import { AppliedFilters } from "./applied-filters";
import { FacetGroups } from "./facet-groups";
import { SortField } from "./sort-field";

const EAGER_CARDS = 4;

export function ProductListing({
	search,
	scope = {},
	onChange,
	headingLevel = 2,
}: {
	search: ListingSearch;
	scope?: ListingScope;
	onChange: (next: ListingSearch) => void | Promise<void>;
	headingLevel?: 2 | 3;
}) {
	const [pending, startTransition] = useTransition();
	const [view, setView] = useOptimistic(search);
	const change = (next: ListingSearch) =>
		startTransition(async () => {
			setView(next);
			await onChange(next);
		});

	const filter = listingFilter(getLocale(), search, scope);
	const pages = useSuspenseQueries({
		queries: pagesOf(search).map((page) => productPageQuery(filter, page)),
	});
	const [first] = pages;
	if (!first) throw new Error("A list has at least one page");
	const { total, facets, priceRange } = first.data;
	const items = pages.flatMap((page) => page.data.items);
	const active = activeCount(view);
	const facetGroups = (
		<FacetGroups
			facets={facets}
			priceRange={priceRange}
			search={view}
			scope={scope}
			onChange={change}
		/>
	);

	return (
		<div className="grid gap-x-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
			<aside aria-label={m.shop_filters_title()} className="max-lg:hidden">
				<div className="sticky top-[calc(var(--header-height)+1.25rem)]">
					{facetGroups}
				</div>
			</aside>
			<div className="min-w-0">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-3">
						<Sheet>
							<SheetTrigger asChild>
								<StoreButton variant="outline" className="gap-2 lg:hidden">
									<SlidersHorizontal aria-hidden className="size-4" />
									{active > 0
										? m.shop_filters_open_count({ count: active })
										: m.shop_filters_open()}
								</StoreButton>
							</SheetTrigger>
							<StoreSheetContent side="left">
								<StoreSheetHeader
									title={m.shop_filters_title()}
									className="h-14 px-4"
								/>
								<div className="min-h-0 flex-1 overflow-y-auto p-4">
									{facetGroups}
								</div>
								<div className="shrink-0 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
									<SheetClose asChild>
										<StoreButton size="lg" fullWidth>
											{m.shop_filters_show({ count: total })}
										</StoreButton>
									</SheetClose>
								</div>
							</StoreSheetContent>
						</Sheet>
						<output
							aria-live="polite"
							className="type-small text-muted-foreground"
						>
							{m.shop_count({ count: total })}
						</output>
					</div>
					<SortField
						value={view.sort ?? SORTS[0]}
						onChange={(sort) => change(setSort(view, sort))}
					/>
				</div>
				<AppliedFilters
					facets={facets}
					search={view}
					scope={scope}
					onChange={change}
				/>
				{items.length > 0 && (
					<>
						<ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
							{items.map((product, index) => (
								<li key={product.slug} className="flex">
									<ProductCard
										product={product}
										headingLevel={headingLevel}
										loading={index < EAGER_CARDS ? "eager" : "lazy"}
										className="w-full"
									/>
								</li>
							))}
						</ul>
						<div className="mt-10 flex flex-col items-center gap-3">
							<p className="type-small text-muted-foreground">
								{m.shop_shown({ shown: items.length, total })}
							</p>
							{items.length < total && (
								<StoreButton
									variant="outline"
									pending={pending}
									onClick={() => change(showMore(view))}
								>
									{m.shop_more()}
								</StoreButton>
							)}
						</div>
					</>
				)}
				{items.length === 0 && search.q && (
					<EmptyState
						title={m.shop_no_results({ q: search.q })}
						description={m.shop_no_results_hint()}
						className="mt-6"
					>
						<StoreButton asChild variant="outline">
							<Link to="/products">{m.shop_clear_search()}</Link>
						</StoreButton>
					</EmptyState>
				)}
				{items.length === 0 && !search.q && (
					<EmptyState
						title={m.shop_no_matches()}
						description={m.shop_no_matches_hint()}
						className="mt-6"
					>
						<StoreButton
							variant="outline"
							onClick={() => change(clearFilters(view))}
						>
							{m.shop_clear_all()}
						</StoreButton>
					</EmptyState>
				)}
			</div>
		</div>
	);
}
