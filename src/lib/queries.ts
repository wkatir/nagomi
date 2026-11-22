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
export type BundleView = InferResponseType<
	ReturnType<typeof api>["bundles"]["$get"],
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

export const homeQuery = (locale: Locale) =>
	queryOptions({
		queryKey: ["home", locale],
		queryFn: () => parseResponse(api().home.$get({ query: { locale } })),
	});

export const productPageQuery = (filter: ListingFilter, page: number) =>
	queryOptions({
		queryKey: ["products", filter, page],
		queryFn: () => {
			const { minPrice, maxPrice, ...rest } = filter;
			return parseResponse(
				api().products.$get({
					query: {
						...rest,
						...(minPrice === undefined ? {} : { minPrice: String(minPrice) }),
						...(maxPrice === undefined ? {} : { maxPrice: String(maxPrice) }),
						page: String(page),
						pageSize: String(LISTING_PAGE_SIZE),
					},
				}),
			);
		},
	});

export const productsBySlugQuery = (locale: Locale, slugs: string[]) =>
	queryOptions({
		queryKey: ["products", "by-slug", locale, slugs],
		queryFn: () =>
			parseResponse(
				api().products.$get({
					query: { locale, slug: slugs, pageSize: "60" },
				}),
			),
		enabled: slugs.length > 0,
	});

export const shippingZonesQuery = (locale: Locale) =>
	queryOptions({
		queryKey: ["shipping-zones", locale],
		queryFn: () =>
			parseResponse(api().shipping.zones.$get({ query: { locale } })),
		staleTime: 5 * 60_000,
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

export const bundlesQuery = (locale: Locale) =>
	queryOptions({
		queryKey: ["bundles", locale],
		queryFn: () => parseResponse(api().bundles.$get({ query: { locale } })),
	});

export const bundleQuery = (slug: string, locale: Locale) =>
	queryOptions({
		queryKey: ["bundle", slug, locale],
		queryFn: () =>
			parseResponse(
				api().bundles[":slug"].$get({ param: { slug }, query: { locale } }),
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
			"products",
			"product",
			"category",
			"brand",
			"bundles",
			"bundle",
			"navigation",
			"home",
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

export const accountProfileQuery = queryOptions({
	queryKey: ["account", "profile"],
	queryFn: () => parseResponse(api().account.profile.$get()),
});

export const accountAddressesQuery = queryOptions({
	queryKey: ["account", "addresses"],
	queryFn: () => parseResponse(api().account.addresses.$get()),
});
