import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { routinesQuery } from "#/features/routines/queries";
import { RoutinesTable } from "#/features/routines/routines-table";
import { routineListSearch } from "#/lib/schemas/routines";
import { m } from "#/paraglide/messages";

const defaults = routineListSearch.parse({});

export const Route = createFileRoute("/admin/routines/")({
	validateSearch: routineListSearch,
	search: { middlewares: [stripSearchParams(defaults)] },
	loaderDeps: ({ search }) => search,
	// Started, not awaited: the table has its own loading state, and paging or filtering
	// should keep the page on screen. prefetchQuery never rejects; a failure shows in the table.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchQuery(routinesQuery(deps));
	},
	component: Routines,
});

function Routines() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<>
			<PageHeader title={m.admin_nav_routines()} />
			<RoutinesTable
				search={search}
				onSearchChange={(change) =>
					navigate({ search: (previous) => ({ ...previous, ...change }) })
				}
			/>
		</>
	);
}
