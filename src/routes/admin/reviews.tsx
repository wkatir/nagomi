import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { ReviewsModeration } from "#/features/engagement/admin-engagement";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/reviews")({
	staticData: { crumb: m.admin_nav_reviews },
	component: () => (
		<>
			<PageHeader title={m.admin_nav_reviews()} />
			<ReviewsModeration />
		</>
	),
});
