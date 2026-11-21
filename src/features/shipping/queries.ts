import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";
import { toQuery } from "#/lib/list";
import type { ZoneListSearch } from "#/lib/schemas/shipping";

// Every query of the shipping module starts with `shippingKeys.all`, so one invalidation
// refreshes the table and the zones an order can be confirmed with.
export const shippingKeys = {
	all: ["admin", "shipping-zones"] as const,
	list: (search: ZoneListSearch) =>
		[...shippingKeys.all, "list", search] as const,
};

type Client = ReturnType<typeof api>["admin"]["shipping-zones"];
export type AdminZone = InferResponseType<Client["$get"], 200>["items"][number];

export const zonesQuery = (search: ZoneListSearch) =>
	queryOptions({
		queryKey: shippingKeys.list(search),
		queryFn: () =>
			parseResponse(
				api().admin["shipping-zones"].$get({ query: toQuery(search) }),
			),
	});

export const activeZonesQuery = queryOptions({
	queryKey: [...shippingKeys.all, "options"],
	queryFn: () => parseResponse(api().admin["shipping-zones"].options.$get()),
});
