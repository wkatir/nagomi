import type { QueryClient } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";
import {
	hasUnknownValue,
	isKnownKind,
	type ListingScope,
	type ListingSearch,
	listingFilter,
	pagesOf,
} from "#/lib/listing";
import { productPageQuery } from "#/lib/queries";
import { getLocale } from "#/paraglide/runtime";

export async function loadListing(
	queryClient: QueryClient,
	search: ListingSearch,
	scope: ListingScope = {},
) {
	if (!isKnownKind(search)) throw notFound();
	const filter = listingFilter(getLocale(), search, scope);
	const pages = await Promise.all(
		pagesOf(search).map((page) =>
			queryClient.ensureQueryData(productPageQuery(filter, page)),
		),
	);
	const [first] = pages;
	if (!first) throw new Error("A list has at least one page");
	if (hasUnknownValue(search, first.facets)) throw notFound();
	return first;
}
