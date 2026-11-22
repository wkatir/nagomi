import {
	queryOptions,
	useQuery,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { api, parseResponse } from "#/lib/api";
import { productsKeys } from "./queries";

// The only place the products module reads brands and categories from. Archived ones
// stay named, since a product may point at one.
export type ProductOption = {
	value: string;
	label: string;
	archived: boolean;
};
export type ProductOptions = {
	brands: ProductOption[];
	categories: ProductOption[];
};

type Named = { id: number; name: string; status: "active" | "archived" };
const toOption = ({ id, name, status }: Named): ProductOption => ({
	value: String(id),
	label: name,
	archived: status === "archived",
});

export const productOptionsQuery = queryOptions({
	queryKey: [...productsKeys.all, "options"],
	queryFn: async (): Promise<ProductOptions> => {
		const [brands, categories] = await Promise.all([
			parseResponse(api().admin.brands.options.$get()),
			parseResponse(api().admin.categories.options.$get()),
		]);
		return {
			brands: brands.map(toOption),
			categories: categories.map(toOption),
		};
	},
});

// For a toolbar: the filters fill in when the lists arrive.
export const useProductOptions = () => useQuery(productOptionsQuery);

// For a form, whose route loads the lists first.
export const useLoadedProductOptions = () =>
	useSuspenseQuery(productOptionsQuery).data;
