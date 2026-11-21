import {
	type SupplierListSearch,
	supplierListSearch,
} from "#/lib/schemas/suppliers";

export const supplierSearchDefaults = supplierListSearch.parse({});

export const clearedFilters = {
	page: 1,
	q: undefined,
	status: undefined,
} satisfies Partial<SupplierListSearch>;

export const isFiltered = (search: SupplierListSearch) =>
	Boolean(search.q || search.status);
