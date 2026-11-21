import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";
import type { Locale } from "#/lib/enums";
import { toQuery } from "#/lib/list";

type PagesApi = ReturnType<typeof api>["admin"]["settings"]["pages"];
export type PageVersion = InferResponseType<
	PagesApi[":id"]["versions"]["$get"],
	200
>["items"][number];

// The store's own settings are `adminSettingsQuery` (lib/queries), read by other screens too.
const settingsKeys = {
	promises: ["admin", "settings", "promises"] as const,
	pages: ["admin", "settings", "pages"] as const,
};

export const promisesQuery = queryOptions({
	queryKey: settingsKeys.promises,
	queryFn: () => parseResponse(api().admin.settings.promises.$get()),
});

export const pagesQuery = queryOptions({
	queryKey: settingsKeys.pages,
	queryFn: () => parseResponse(api().admin.settings.pages.$get()),
});

// Under the pages' key, so saving a text refreshes the list and its history together.
export const pageVersionsQuery = (pageId: number, locale: Locale) =>
	infiniteQueryOptions({
		queryKey: [...settingsKeys.pages, "versions", pageId, locale],
		initialPageParam: undefined as number | undefined,
		queryFn: ({ pageParam }) =>
			parseResponse(
				api().admin.settings.pages[":id"].versions.$get({
					param: { id: String(pageId) },
					query: {
						locale,
						...toQuery({ cursor: pageParam }),
					},
				}),
			),
		getNextPageParam: (last) => last.nextCursor ?? undefined,
	});
