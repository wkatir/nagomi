import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { Followups, followupsQuery } from "#/features/orders/followups";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/orders/followups")({
	staticData: { crumb: m.admin_nav_followups },
	loader: ({ context }) => {
		void context.queryClient.prefetchQuery(followupsQuery);
	},
	component: FollowupsPage,
});

function FollowupsPage() {
	return (
		<>
			<PageHeader title={m.admin_nav_followups()} />
			<Followups />
		</>
	);
}
