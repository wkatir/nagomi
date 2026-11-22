import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";
import { toQuery } from "#/lib/list";
import type { PromotionListSearch } from "#/lib/schemas/promotions";

export const promotionsKeys = {
	all: ["admin", "promotions"] as const,
	list: (search: PromotionListSearch) =>
		[...promotionsKeys.all, "list", search] as const,
};

type Client = ReturnType<typeof api>["admin"]["promotions"];
export type AdminPromotion = InferResponseType<
	Client["$get"],
	200
>["items"][number];

export const promotionsQuery = (search: PromotionListSearch) =>
	queryOptions({
		queryKey: promotionsKeys.list(search),
		queryFn: () =>
			parseResponse(api().admin.promotions.$get({ query: toQuery(search) })),
	});
