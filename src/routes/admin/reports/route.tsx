import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { ReportTabs } from "#/features/reports/report-tabs";
import { requireStaffArea } from "#/lib/admin-area";
import { reportDays } from "#/lib/schemas/reports";
import { m } from "#/paraglide/messages";

// The days of a report live here, in the URL, so they stay when the user moves from one
// report to the next.
export const Route = createFileRoute("/admin/reports")({
	beforeLoad: requireStaffArea("reports"),
	staticData: { crumb: m.admin_nav_reports },
	validateSearch: reportDays,
	component: Reports,
});

function Reports() {
	const { from, to } = Route.useSearch();
	return (
		<>
			<PageHeader title={m.admin_nav_reports()} />
			<ReportTabs days={{ from, to }} />
			<Outlet />
		</>
	);
}
