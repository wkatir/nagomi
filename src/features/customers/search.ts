import { toQuery } from "#/lib/list";
import {
	type CustomerListSearch,
	customerListSearch,
} from "#/lib/schemas/customers";

export const customerSearchDefaults = customerListSearch.parse({});

export const clearedFilters = {
	page: 1,
	q: undefined,
	segment: undefined,
} satisfies Partial<CustomerListSearch>;

export const isFiltered = (search: CustomerListSearch) =>
	Boolean(search.q || search.segment);

// The whole search, not one page of it.
export const exportHref = (search: CustomerListSearch) => {
	const { page: _p, pageSize: _s, sort: _o, dir: _d, ...filters } = search;
	const query = new URLSearchParams(toQuery(filters)).toString();
	return `/api/admin/exports/customers.csv${query ? `?${query}` : ""}`;
};
