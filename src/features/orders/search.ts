import { toQuery } from "#/lib/list";
import { type OrderListSearch, orderListSearch } from "#/lib/schemas/orders";

export const orderSearchDefaults = orderListSearch.parse({});

export const clearedFilters = {
	page: 1,
	q: undefined,
	status: undefined,
	paymentStatus: undefined,
	channel: undefined,
	from: undefined,
	to: undefined,
} satisfies Partial<OrderListSearch>;

export const isFiltered = (search: OrderListSearch) =>
	Boolean(
		search.q ||
			search.status ||
			search.paymentStatus ||
			search.channel ||
			search.from ||
			search.to,
	);

export const exportHref = (search: OrderListSearch) => {
	const { page: _p, pageSize: _s, sort: _o, dir: _d, ...filters } = search;
	const query = new URLSearchParams(toQuery(filters)).toString();
	return `/api/admin/exports/orders.csv${query ? `?${query}` : ""}`;
};
