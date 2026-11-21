import {
	type PurchaseListSearch,
	purchaseListSearch,
} from "#/lib/schemas/purchasing";

export const purchaseSearchDefaults = purchaseListSearch.parse({});

export const clearedFilters = {
	page: 1,
	q: undefined,
	status: undefined,
	supplierId: undefined,
	from: undefined,
	to: undefined,
} satisfies Partial<PurchaseListSearch>;

export const isFiltered = (search: PurchaseListSearch) =>
	Boolean(
		search.q || search.status || search.supplierId || search.from || search.to,
	);
