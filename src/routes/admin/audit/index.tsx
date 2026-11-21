import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { AuditFeed } from "#/features/audit/audit-feed";
import { auditActorsQuery, auditFeedQuery } from "#/features/audit/queries";
import { auditListSearch } from "#/lib/schemas/audit";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/audit/")({
	validateSearch: auditListSearch,
	loaderDeps: ({ search }) => search,
	// Started, not awaited: the log has its own loading state, and a filter change should
	// keep the page on screen.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchInfiniteQuery(auditFeedQuery(deps));
		void context.queryClient.prefetchQuery(auditActorsQuery);
	},
	component: Audit,
});

function Audit() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<>
			<PageHeader title={m.admin_nav_audit()} />
			<AuditFeed
				search={search}
				onSearchChange={(change) =>
					navigate({ search: (previous) => ({ ...previous, ...change }) })
				}
			/>
		</>
	);
}
