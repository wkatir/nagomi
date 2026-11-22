import {
	type ProductListSearch,
	productListSearch,
} from "#/lib/schemas/products";

export const productSearchDefaults = productListSearch.parse({});

export const clearedFilters = {
	page: 1,
	q: undefined,
	status: undefined,
	brandId: undefined,
	categoryId: undefined,
} satisfies Partial<ProductListSearch>;

export const isFiltered = (search: ProductListSearch) =>
	Boolean(search.q || search.status || search.brandId || search.categoryId);

// Selects hold ids as text.
export const idOf = (value: string | undefined) =>
	value === undefined ? undefined : Number(value);
