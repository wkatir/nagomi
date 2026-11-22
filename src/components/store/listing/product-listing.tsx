import { useSuspenseQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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

// `scope` fixes some facets (a category's page fixes the category). `onChange` puts the change in the
// URL and returns once the new list is shown; until then the list shows the choice, not the data.
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
	const { total, facets } = first.data;
	const items = pages.flatMap((page) => page.data.items);
	const active = activeCount(view);
	const facetGroups = (
		<FacetGroups
			facets={facets}
			search={view}
			scope={scope}
			onChange={change}
		/>
	);

	return (
		<div className="grid gap-x-12 lg:grid-cols-[15rem_minmax(0,1fr)]">
			<aside aria-label={m.shop_filters_title()} className="max-lg:hidden">
				{facetGroups}
			</aside>
			<div className="min-w-0">
				<div className="flex items-end justify-between gap-4">
					<div className="flex items-center gap-4">
						<Sheet>
							<SheetTrigger asChild>
								<StoreButton variant="outline" className="lg:hidden">
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
								<div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2">
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
						<output className="type-small text-muted-foreground">
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
						<div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-3 md:gap-x-5 md:gap-y-12">
							{items.map((product, index) => (
								<ProductCard
									key={product.slug}
									product={product}
									headingLevel={headingLevel}
									loading={index < EAGER_CARDS ? "eager" : "lazy"}
								/>
							))}
						</div>
						<div className="mt-12 flex flex-col items-center gap-4">
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
						className="mt-10"
					>
						<StoreButton asChild variant="outline">
							<Link to="/products">{m.shop_clear_search()}</Link>
						</StoreButton>
					</EmptyState>
				)}
				{items.length === 0 && !search.q && (
					<EmptyState title={m.shop_no_matches()} className="mt-10">
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
