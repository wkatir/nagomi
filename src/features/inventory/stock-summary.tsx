import { useQuery } from "@tanstack/react-query";
import {
	StatCard,
	StatGrid,
	StatGridSkeleton,
} from "#/components/admin/stat-card";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { useMoney } from "#/hooks/use-money";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";
import { stockSummaryQuery } from "./queries";

export function StockSummary() {
	const money = useMoney();
	const query = useQuery(stockSummaryQuery);
	if (query.isPending)
		return <StatGridSkeleton count={2} className="mb-admin-section" />;
	if (query.isError)
		return (
			<Alert variant="destructive" className="mb-admin-section">
				<AlertDescription className="flex flex-wrap items-center justify-between gap-3">
					{errorMessage(query.error)}
					<Button variant="outline" size="sm" onClick={() => query.refetch()}>
						{m.admin_table_retry()}
					</Button>
				</AlertDescription>
			</Alert>
		);
	const summary = query.data;
	return (
		<StatGrid className="mb-admin-section">
			<StatCard
				label={m.admin_inventory_sum_stock()}
				value={m.admin_units({ count: summary.units })}
				note={m.admin_inventory_sum_stock_note({
					amount: money(summary.value),
				})}
			/>
			<StatCard
				label={m.admin_inventory_sum_low()}
				value={summary.lowStock}
				note={m.admin_inventory_sum_low_note()}
				tone={summary.lowStock > 0 ? "warning" : undefined}
			/>
		</StatGrid>
	);
}
