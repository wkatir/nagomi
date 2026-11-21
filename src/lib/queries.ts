import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import type { Locale } from "#/lib/enums";
import type { CatalogProduct } from "#/server/domain/catalog";
import type { ProductCard } from "#/server/domain/catalog-query";
import { api, parseResponse } from "./api";
import { LISTING_PAGE_SIZE, type ListingFilter } from "./listing";

export type { CatalogProduct };
export type CatalogCard = ProductCard;
export type ProductPage = InferResponseType<
	ReturnType<typeof api>["products"]["$get"],
	200
>;
export type RoutineView = InferResponseType<
	ReturnType<typeof api>["routines"]["$get"],
	200
>[number];

export const storeQuery = queryOptions({
	queryKey: ["store"],
	queryFn: () => parseResponse(api().store.$get()),
	staleTime: 5 * 60_000,
});

export const signInMethodsQuery = queryOptions({
	queryKey: ["sign-in-methods"],
	queryFn: () => parseResponse(api()["sign-in-methods"].$get()),
	staleTime: Number.POSITIVE_INFINITY,
});

export const adminSettingsQuery = queryOptions({
	queryKey: ["admin", "settings"],
	queryFn: () => parseResponse(api().admin.settings.$get()),
});

export const catalogQuery = (locale: Locale) =>
	queryOptions({
		queryKey: ["catalog", locale],
		queryFn: () => parseResponse(api().catalog.$get({ query: { locale } })),
	});

export const productPageQuery = (filter: ListingFilter, page: number) =>
	queryOptions({
		queryKey: ["products", filter, page],
		queryFn: () =>
			parseResponse(
				api().products.$get({
					query: {
						...filter,
						page: String(page),
						pageSize: String(LISTING_PAGE_SIZE),
					},
				}),
			),
	});

// 404 when the need has no published product.
export const concernQuery = (slug: string, locale: Locale) =>
	queryOptions({
		queryKey: ["concern", slug, locale],
		queryFn: () =>
			parseResponse(
				api().concerns[":slug"].$get({ param: { slug }, query: { locale } }),
			),
	});

export const categoryQuery = (slug: string, locale: Locale) =>
	queryOptions({
		queryKey: ["category", slug, locale],
		queryFn: () =>
			parseResponse(
				api().categories[":slug"].$get({ param: { slug }, query: { locale } }),
			),
	});

export const brandQuery = (slug: string, locale: Locale) =>
	queryOptions({
		queryKey: ["brand", slug, locale],
		queryFn: () =>
			parseResponse(
				api().brands[":slug"].$get({ param: { slug }, query: { locale } }),
			),
	});

export const routinesQuery = (locale: Locale) =>
	queryOptions({
		queryKey: ["routines", locale],
		queryFn: () => parseResponse(api().routines.$get({ query: { locale } })),
	});

export const routineQuery = (slug: string, locale: Locale) =>
	queryOptions({
		queryKey: ["routine", slug, locale],
		queryFn: () =>
			parseResponse(
				api().routines[":slug"].$get({ param: { slug }, query: { locale } }),
			),
	});

export const navigationQuery = (locale: Locale) =>
	queryOptions({
		queryKey: ["navigation", locale],
		queryFn: () => parseResponse(api().navigation.$get({ query: { locale } })),
		staleTime: 5 * 60_000,
	});

export const productQuery = (slug: string, locale: Locale) =>
	queryOptions({
		queryKey: ["product", slug, locale],
		queryFn: () =>
			parseResponse(
				api().products[":slug"].$get({ param: { slug }, query: { locale } }),
			),
	});

// Call after any write that changes products, prices or units left (an order, a product
// edit, a purchase receipt, a stock count).
export const invalidateCatalog = (queryClient: QueryClient) =>
	Promise.all(
		[
			"catalog",
			"products",
			"product",
			"concern",
			"category",
			"brand",
			"routines",
			"routine",
			"navigation",
		].map((root) => queryClient.invalidateQueries({ queryKey: [root] })),
	);

export const pageQuery = (slug: string, locale: Locale) =>
	queryOptions({
		queryKey: ["page", slug, locale],
		queryFn: () =>
			parseResponse(
				api().pages[":slug"].$get({ param: { slug }, query: { locale } }),
			),
	});
