import {
	type InvoiceListSearch,
	invoiceListSearch,
} from "#/lib/schemas/invoices";

export const invoiceSearchDefaults = invoiceListSearch.parse({});

export const clearedFilters = {
	page: 1,
	q: undefined,
	status: undefined,
	orderId: undefined,
} satisfies Partial<InvoiceListSearch>;

export const isFiltered = (search: InvoiceListSearch) =>
	Boolean(search.q || search.status || search.orderId);
