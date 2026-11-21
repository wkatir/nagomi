import { type ZoneListSearch, zoneListSearch } from "#/lib/schemas/shipping";

export const zoneSearchDefaults = zoneListSearch.parse({});

export const clearedFilters = {
	page: 1,
	status: undefined,
	method: undefined,
} satisfies Partial<ZoneListSearch>;

export const isFiltered = (search: ZoneListSearch) =>
	Boolean(search.status || search.method);
