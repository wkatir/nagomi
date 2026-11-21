import { ChartCard } from "#/components/admin/chart-card";
import {
	useCompactMoney,
	usePeriodLabel,
} from "#/components/admin/chart-format";
import { Section } from "#/components/admin/section";
import { StatCard, StatGrid } from "#/components/admin/stat-card";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { useMoney } from "#/hooks/use-money";
import type { Granularity } from "#/lib/schemas/reports";
import { m } from "#/paraglide/messages";
import { usePercent } from "./format";
import type { SalesReport } from "./queries";

type Period = SalesReport["periods"][number];

export function SalesReportView({
	report,
	granularity,
}: {
	report: SalesReport;
	granularity: Granularity;
}) {
	const money = useMoney();
	const compact = useCompactMoney();
	const day = usePeriodLabel();
	const percent = usePercent();
	const { totals, periods } = report;

	// A week is shown by its days, cut by the range when the range cuts it.
	const periodText = (p: Period) =>
		granularity === "week" && p.from !== p.to
			? `${day(p.from)} - ${day(p.to)}`
			: day(p.period, granularity);
	const points = (value: (p: Period) => number) =>
		periods.map((p) => ({
			key: p.period,
			label: day(p.period, granularity),
			value: value(p),
		}));

	return (
		<>
			<StatGrid>
				<StatCard
					label={m.admin_kpi_revenue()}
					value={money(totals.revenue)}
					note={m.admin_report_orders_n({ count: totals.orders })}
				/>
				<StatCard
					label={m.admin_kpi_gross_profit()}
					value={money(totals.grossProfit)}
					note={m.admin_report_margin_n({ percent: percent(totals.margin) })}
				/>
				<StatCard
					label={m.admin_report_units()}
					value={String(totals.units)}
					note={m.admin_report_kept_units()}
				/>
				<StatCard
					label={m.admin_kpi_cogs()}
					value={money(totals.costOfGoodsSold)}
					note={m.admin_kpi_cogs_note()}
				/>
			</StatGrid>
			<div className="grid gap-admin-stack lg:grid-cols-2">
				<ChartCard
					title={m.admin_report_sales_chart()}
					categoryLabel={m.admin_report_period()}
					seriesLabel={m.admin_kpi_revenue()}
					points={points((p) => p.revenue)}
					formatValue={money}
					formatTick={compact}
				/>
				<ChartCard
					title={m.admin_report_profit_chart()}
					categoryLabel={m.admin_report_period()}
					seriesLabel={m.admin_kpi_gross_profit()}
					points={points((p) => p.grossProfit)}
					formatValue={money}
					formatTick={compact}
				/>
			</div>
			<Section title={m.admin_report_detail()}>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{m.admin_report_period()}</TableHead>
							<TableHead className="text-right max-md:hidden">
								{m.admin_report_orders()}
							</TableHead>
							<TableHead className="text-right max-md:hidden">
								{m.admin_report_units()}
							</TableHead>
							<TableHead className="text-right">
								{m.admin_kpi_revenue()}
							</TableHead>
							<TableHead className="text-right max-md:hidden">
								{m.admin_kpi_cogs()}
							</TableHead>
							<TableHead className="text-right">
								{m.admin_kpi_gross_profit()}
							</TableHead>
							<TableHead className="text-right max-md:hidden">
								{m.admin_report_margin()}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{periods.map((p) => (
							<TableRow key={p.period}>
								<TableCell>
									{periodText(p)}
									{p.partial && (
										<span className="ml-2 type-meta text-muted-foreground">
											{m.admin_report_partial()}
										</span>
									)}
								</TableCell>
								<TableCell className="text-right tabular-nums max-md:hidden">
									{p.orders}
								</TableCell>
								<TableCell className="text-right tabular-nums max-md:hidden">
									{p.units}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{money(p.revenue)}
								</TableCell>
								<TableCell className="text-right tabular-nums max-md:hidden">
									{money(p.costOfGoodsSold)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{money(p.grossProfit)}
								</TableCell>
								<TableCell className="text-right tabular-nums max-md:hidden">
									{percent(p.margin)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
					<TableFooter>
						<TableRow>
							<TableCell>{m.admin_report_total()}</TableCell>
							<TableCell className="text-right tabular-nums max-md:hidden">
								{totals.orders}
							</TableCell>
							<TableCell className="text-right tabular-nums max-md:hidden">
								{totals.units}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{money(totals.revenue)}
							</TableCell>
							<TableCell className="text-right tabular-nums max-md:hidden">
								{money(totals.costOfGoodsSold)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{money(totals.grossProfit)}
							</TableCell>
							<TableCell className="text-right tabular-nums max-md:hidden">
								{percent(totals.margin)}
							</TableCell>
						</TableRow>
					</TableFooter>
				</Table>
			</Section>
		</>
	);
}
