import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { ConcernsTable } from "#/features/concerns/concerns-table";
import { concernsQuery } from "#/features/concerns/queries";
import { adminSettingsQuery } from "#/lib/queries";
import { concernListSearch } from "#/lib/schemas/concerns";
import { m } from "#/paraglide/messages";

const defaults = concernListSearch.parse({});

export const Route = createFileRoute("/admin/concerns")({
	staticData: { crumb: m.admin_nav_concerns },
	validateSearch: concernListSearch,
	search: { middlewares: [stripSearchParams(defaults)] },
	loaderDeps: ({ search }) => search,
	// The table has its own loading state, and paging or filtering should keep the page on
	// screen: its query is started, not awaited (prefetchQuery never rejects; a failure shows in
	// the table). The settings the dialog needs are small and kept.
	loader: async ({ context, deps }) => {
		void context.queryClient.prefetchQuery(concernsQuery(deps));
		await context.queryClient.ensureQueryData(adminSettingsQuery);
	},
	component: Concerns,
});

function Concerns() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<>
			<PageHeader title={m.admin_nav_concerns()} />
			<ConcernsTable
				search={search}
				onSearchChange={(change) =>
					navigate({ search: (previous) => ({ ...previous, ...change }) })
				}
			/>
		</>
	);
}
