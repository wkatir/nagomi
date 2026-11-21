import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, parseResponse } from "#/lib/api";
import { toQuery } from "#/lib/list";

type MediaApi = ReturnType<typeof api>["admin"]["media"];
export type MediaFile = InferResponseType<MediaApi[":id"]["$get"], 200>;

const mediaKeys = { all: ["admin", "media"] as const };

export const mediaFilesQuery = infiniteQueryOptions({
	queryKey: [...mediaKeys.all, "files"],
	initialPageParam: undefined as number | undefined,
	queryFn: ({ pageParam }) =>
		parseResponse(
			api().admin.media.$get({
				query: toQuery({ cursor: pageParam, limit: 24 }),
			}),
		),
	getNextPageParam: (last) => last.nextCursor ?? undefined,
});

export const mediaFileQuery = (id: number) =>
	queryOptions({
		queryKey: [...mediaKeys.all, "file", id],
		queryFn: () =>
			parseResponse(
				api().admin.media[":id"].$get({ param: { id: String(id) } }),
			),
	});

// Uploading a file already stored answers the row it has.
export async function uploadMedia(file: File): Promise<MediaFile> {
	const body = new FormData();
	body.set("file", file);
	const stored = await parseResponse(
		api().admin.media.$post(undefined, { init: { body } }),
	);
	// The type also holds the text of the router's early refusals, which parseResponse throws.
	if (typeof stored === "string")
		throw new Error(`Unexpected upload answer: ${stored}`);
	return stored;
}
