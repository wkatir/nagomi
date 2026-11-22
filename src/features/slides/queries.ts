import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";

type SlidesApi = ReturnType<typeof api>["admin"]["home-slides"];
export type Slide = InferResponseType<SlidesApi[":id"]["$get"], 200>;

export const slidesKeys = {
	all: ["admin", "slides"] as const,
	detail: (id: number) => [...slidesKeys.all, "detail", id] as const,
};

export const slidesQuery = queryOptions({
	queryKey: [...slidesKeys.all, "list"],
	queryFn: () => parseResponse(api().admin["home-slides"].$get({ query: {} })),
});

export const slideQuery = (id: number) =>
	queryOptions({
		queryKey: slidesKeys.detail(id),
		queryFn: () =>
			parseResponse(
				api().admin["home-slides"][":id"].$get({ param: { id: String(id) } }),
			),
	});
