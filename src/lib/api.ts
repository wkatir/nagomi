import { createIsomorphicFn } from "@tanstack/react-start";
import {
	DetailedError,
	hc,
	type InferResponseType,
	parseResponse,
} from "hono/client";
import type { Api } from "#/server/app";

const apiFetch = createIsomorphicFn()
	.server(async (input: RequestInfo | URL, init?: RequestInit) => {
		const { api } = await import("#/server/app");
		return api.fetch(new Request(input, init));
	})
	.client((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

const origin = () =>
	typeof window === "undefined" ? "http://localhost" : window.location.origin;

export const api = () =>
	hc<Api>(origin(), { fetch: apiFetch as typeof fetch }).api;

export { parseResponse };

export function apiErrorOf(
	error: unknown,
): { status: number; code: string; body: Record<string, unknown> } | null {
	if (!(error instanceof DetailedError)) return null;
	// `data` is the parsed JSON, the text of a non-JSON body, or undefined without a body.
	const data: unknown = error.detail.data;
	const body =
		typeof data === "object" && data !== null
			? (data as Record<string, unknown>)
			: {};
	return {
		status: Number(error.statusCode),
		code: typeof body.error === "string" ? body.error : "http_error",
		body,
	};
}

export const isNotFound = (error: unknown) => apiErrorOf(error)?.status === 404;

type Client = ReturnType<typeof api>;

export type AdminOrders = InferResponseType<
	Client["admin"]["orders"]["$get"],
	200
>;
export type AdminOrder = InferResponseType<
	Client["admin"]["orders"][":id"]["$get"],
	200
>;
export type AdminProducts = InferResponseType<
	Client["admin"]["products"]["$get"],
	200
>;
export type AdminProduct = InferResponseType<
	Client["admin"]["products"][":id"]["$get"],
	200
>;
export type AdminSettings = InferResponseType<
	Client["admin"]["settings"]["$get"],
	200
>;
export type AdminPages = InferResponseType<
	Client["admin"]["settings"]["pages"]["$get"],
	200
>;
export type AdminPromises = InferResponseType<
	Client["admin"]["settings"]["promises"]["$get"],
	200
>;
