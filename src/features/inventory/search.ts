import { toQuery } from "#/lib/list";
import {
	type LotListSearch,
	lotListSearch,
	type MovementFilters,
	reorderSearch,
	type StockListSearch,
	stockListSearch,
} from "#/lib/schemas/inventory";

export const stockSearchDefaults = stockListSearch.parse({});
export const lotSearchDefaults = lotListSearch.parse({});
export const reorderSearchDefaults = reorderSearch.parse({});

export const clearedStockFilters = {
	page: 1,
	q: undefined,
	view: undefined,
} satisfies Partial<StockListSearch>;
export const clearedLotFilters = {
	page: 1,
	q: undefined,
} satisfies Partial<LotListSearch>;
export const clearedMovementFilters = {
	kind: undefined,
	reason: undefined,
	sku: undefined,
	lotId: undefined,
	from: undefined,
	to: undefined,
} satisfies MovementFilters;

export const isStockFiltered = (search: StockListSearch) =>
	Boolean(search.q || search.view);
export const isLotsFiltered = (search: LotListSearch) => Boolean(search.q);
export const isLedgerFiltered = (filters: MovementFilters) =>
	Boolean(
		filters.kind ||
			filters.reason ||
			filters.sku ||
			filters.lotId ||
			filters.from ||
			filters.to,
	);

// Every movement the filters match, not only the pages loaded.
export const movementsExportHref = (filters: MovementFilters) => {
	const query = new URLSearchParams(toQuery(filters)).toString();
	return `/api/admin/exports/movements.csv${query ? `?${query}` : ""}`;
};
