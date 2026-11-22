import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { toast } from "sonner";
import { getLocale } from "#/paraglide/runtime";
import { api, parseResponse } from "./api";
import { cartDrawer } from "./cart-ui";
import { errorMessage } from "./errors";
import { storeQuery } from "./queries";

// Also checked by the cart API.
export const useMaxQuantity = () =>
	useSuspenseQuery(storeQuery).data.maxQuantityPerLine;

// The cart lives on the server (an httpOnly cookie names it); every read is priced there.
// The browser keeps only this query's cache, for the header count and the drawer.
export type Cart = InferResponseType<
	ReturnType<typeof api>["cart"]["$get"],
	200
>;
export type CartLine = Cart["lines"][number];

type CartQuery = { locale: "es" | "en"; municipality?: string };

const cartKey = (query: CartQuery) => [
	"cart",
	query.locale,
	query.municipality ?? null,
];

export const cartQuery = (municipality?: string) => {
	const query: CartQuery = {
		locale: getLocale(),
		...(municipality ? { municipality } : {}),
	};
	return queryOptions({
		queryKey: cartKey(query),
		queryFn: () => parseResponse(api().cart.$get({ query })),
		// Server-side API calls carry no cookies, so the cart is read in the browser only.
		enabled: typeof window !== "undefined",
	});
};

export const useCart = (municipality?: string) =>
	useQuery(cartQuery(municipality));

export const useCartCount = () => useCart().data?.count ?? 0;

export const invalidateCart = (queryClient: QueryClient) =>
	queryClient.invalidateQueries({ queryKey: ["cart"] });

export function useCartActions() {
	const queryClient = useQueryClient();
	const query: CartQuery = { locale: getLocale() };
	const settle = (cart: Cart) => {
		queryClient.setQueryData(cartKey(query), cart);
		void queryClient.invalidateQueries({
			queryKey: ["cart"],
			predicate: (q) => q.queryKey[2] !== null,
		});
	};
	const add = useMutation({
		mutationFn: (input: { sku?: string; bundle?: string; quantity: number }) =>
			parseResponse(api().cart.items.$post({ query, json: input })),
		onSuccess: settle,
	});
	const update = useMutation({
		mutationFn: (input: { id: number; quantity: number }) =>
			parseResponse(
				api().cart.items[":id"].$patch({
					param: { id: String(input.id) },
					query,
					json: { quantity: input.quantity },
				}),
			),
		onSuccess: settle,
	});
	const remove = useMutation({
		mutationFn: (id: number) =>
			parseResponse(
				api().cart.items[":id"].$delete({ param: { id: String(id) }, query }),
			),
		onSuccess: settle,
	});
	const clear = useMutation({
		mutationFn: () => parseResponse(api().cart.$delete({ query })),
		onSuccess: settle,
	});
	const applyCoupon = useMutation({
		mutationFn: (code: string) =>
			parseResponse(api().cart.coupon.$put({ query, json: { code } })),
		onSuccess: settle,
	});
	const removeCoupon = useMutation({
		mutationFn: () => parseResponse(api().cart.coupon.$delete({ query })),
		onSuccess: settle,
	});
	return { add, update, remove, clear, applyCoupon, removeCoupon };
}

// Adds and opens the drawer from the button that was pressed; a refusal (sold out meanwhile)
// is shown as a toast.
export function useAddToCart() {
	const { add } = useCartActions();
	return {
		pending: add.isPending,
		add: (
			input: { sku?: string; bundle?: string; quantity: number },
			opener: HTMLElement | null,
		) =>
			add.mutate(input, {
				onSuccess: () => cartDrawer.open(opener),
				onError: (e) => toast.error(errorMessage(e)),
			}),
	};
}
