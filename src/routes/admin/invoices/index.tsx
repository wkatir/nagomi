import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { InvoicesTable } from "#/features/invoices/invoices-table";
import { invoicesQuery } from "#/features/invoices/queries";
import { invoiceSearchDefaults } from "#/features/invoices/search";
import { invoiceListSearch } from "#/lib/schemas/invoices";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/invoices/")({
	validateSearch: invoiceListSearch,
	search: { middlewares: [stripSearchParams(invoiceSearchDefaults)] },
	loaderDeps: ({ search }) => search,
	// Started, not awaited: the table has its own loading state, and paging or filtering
	// should keep the page on screen. prefetchQuery never rejects; a failure shows in the table.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchQuery(invoicesQuery(deps));
	},
	component: Invoices,
});

function Invoices() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<>
			<PageHeader title={m.admin_nav_invoices()} />
			<InvoicesTable
				search={search}
				onSearchChange={(change) =>
					navigate({ search: (previous) => ({ ...previous, ...change }) })
				}
			/>
		</>
	);
}
