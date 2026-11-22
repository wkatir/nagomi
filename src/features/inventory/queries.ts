import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";
import { toQuery } from "#/lib/list";
import type {
	LotListSearch,
	MovementFilters,
	StockListSearch,
} from "#/lib/schemas/inventory";

type Client = ReturnType<typeof api>["admin"];
type Stock = InferResponseType<Client["inventory"]["$get"], 200>;
export type StockRow = Stock["items"][number];
export type StockSummary = InferResponseType<
	Client["inventory"]["summary"]["$get"],
	200
>;
type Lots = InferResponseType<Client["inventory"]["lots"]["$get"], 200>;
export type LotRow = Lots["items"][number];
type MovementFeed = InferResponseType<
	Client["inventory"]["movements"]["$get"],
	200
>;
export type Movement = MovementFeed["items"][number];
type Reorder = InferResponseType<Client["reports"]["reorder"]["$get"], 200>;
export type Suggestion = Reorder["variants"][number];

const ROOT = ["admin", "inventory"] as const;
const inventoryKeys = {
	stock: (search: StockListSearch) => [...ROOT, "stock", search] as const,
	summary: [...ROOT, "summary"] as const,
	lots: (search: LotListSearch) => [...ROOT, "lots", search] as const,
	movements: (filters: MovementFilters) =>
		[...ROOT, "movements", filters] as const,
};

export const stockQuery = (search: StockListSearch) =>
	queryOptions({
		queryKey: inventoryKeys.stock(search),
		queryFn: () =>
			parseResponse(api().admin.inventory.$get({ query: toQuery(search) })),
	});

export const stockSummaryQuery = queryOptions({
	queryKey: inventoryKeys.summary,
	queryFn: () => parseResponse(api().admin.inventory.summary.$get()),
});

export const lotsQuery = (search: LotListSearch) =>
	queryOptions({
		queryKey: inventoryKeys.lots(search),
		queryFn: () =>
			parseResponse(
				api().admin.inventory.lots.$get({ query: toQuery(search) }),
			),
	});

const MOVEMENTS_PER_PAGE = 50;

export const movementsQuery = (filters: MovementFilters) =>
	infiniteQueryOptions({
		queryKey: inventoryKeys.movements(filters),
		initialPageParam: undefined as number | undefined,
		queryFn: ({ pageParam }) =>
			parseResponse(
				api().admin.inventory.movements.$get({
					query: toQuery({
						...filters,
						limit: MOVEMENTS_PER_PAGE,
						cursor: pageParam,
					}),
				}),
			),
		getNextPageParam: (last) => last.nextCursor,
	});
