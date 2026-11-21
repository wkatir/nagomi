import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";

type SlidesApi = ReturnType<typeof api>["admin"]["home-slides"];
export type Slide = InferResponseType<SlidesApi[":id"]["$get"], 200>;

// Every query of the slides module starts with `slidesKeys.all`, so one invalidation
// refreshes the list and the open slide after a change.
export const slidesKeys = {
	all: ["admin", "slides"] as const,
	detail: (id: number) => [...slidesKeys.all, "detail", id] as const,
};

// Slides are few, so they come in one answer and the tabs narrow them on the screen.
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
