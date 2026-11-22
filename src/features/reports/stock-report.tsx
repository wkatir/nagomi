import { ChartCard } from "#/components/admin/chart-card";
import { Section } from "#/components/admin/section";
import { StatCard, StatGrid } from "#/components/admin/stat-card";
import { ToneBadge } from "#/components/admin/tone-badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { useMoney } from "#/hooks/use-money";
import { useCalendarDate } from "#/hooks/use-store-date";
import { m } from "#/paraglide/messages";
import { useDecimal } from "./format";
import type { StockReport } from "./queries";

const numeric = "text-right tabular-nums";
const CHART_ROWS = 10;

type StockRow = StockReport["variants"][number];

export function StockStateBadge({ row }: { row: StockRow }) {
	if (row.outOfStock)
		return <ToneBadge tone="danger">{m.admin_stock_out()}</ToneBadge>;
	if (row.lowStock)
		return <ToneBadge tone="warning">{m.admin_stock_low()}</ToneBadge>;
	return <ToneBadge tone="success">{m.admin_stock_ok()}</ToneBadge>;
}

export function StockReportView({ report }: { report: StockReport }) {
	const money = useMoney();
	const formatDay = useCalendarDate();
	const decimal = useDecimal();
	const { totals, variants } = report;
	const covered = variants
		.flatMap(({ daysOfCover, ...v }) =>
			daysOfCover !== null && !v.outOfStock ? [{ ...v, daysOfCover }] : [],
		)
		.slice(0, CHART_ROWS);
	const dash = <span className="text-muted-foreground">—</span>;
	return (
		<>
			<StatGrid className="lg:grid-cols-5">
				<StatCard
					label={m.admin_report_on_hand()}
					value={String(totals.onHand)}
					note={m.admin_report_as_of({ date: formatDay(report.asOf) })}
				/>
				<StatCard
					label={m.admin_report_stock_value()}
					value={money(totals.value)}
					note={m.admin_report_at_cost()}
				/>
				<StatCard
					label={m.admin_stock_out_title()}
					value={String(totals.outOfStock)}
					tone={totals.outOfStock > 0 ? "destructive" : undefined}
					note={m.admin_stock_out_note()}
				/>
				<StatCard
					label={m.admin_overview_below_reorder()}
					value={String(totals.lowStock)}
					tone={totals.lowStock > 0 ? "warning" : undefined}
					note={m.admin_stock_threshold_note({
						count: report.lowStockThreshold,
					})}
				/>
				<StatCard
					label={m.admin_report_rotation()}
					value={
						totals.rotation === null
							? m.admin_report_na()
							: decimal(totals.rotation)
					}
					note={m.admin_report_rotation_note({ count: totals.unitsSold })}
				/>
			</StatGrid>
			<ChartCard
				kind="hbar"
				title={m.admin_report_cover_chart({ count: CHART_ROWS })}
				description={m.admin_report_cover_note()}
				categoryLabel={m.admin_report_product()}
				seriesLabel={m.admin_report_days_of_cover()}
				points={covered.map((v) => ({
					key: String(v.variantId),
					label: v.sku,
					value: v.daysOfCover,
				}))}
				formatValue={(days) => m.admin_report_days_n({ count: days })}
				formatTick={String}
			/>
			<Section
				title={m.admin_report_stock_by_size()}
				description={m.admin_report_stock_order_note()}
			>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{m.admin_report_product()}</TableHead>
							<TableHead>{m.admin_col_status()}</TableHead>
							<TableHead className="text-right">
								{m.admin_report_on_hand()}
							</TableHead>
							<TableHead className="text-right max-md:hidden">
								{m.admin_report_reorder_point()}
							</TableHead>
							<TableHead className="text-right">
								{m.admin_report_units_sold()}
							</TableHead>
							<TableHead className="text-right max-md:hidden">
								{m.admin_report_rotation()}
							</TableHead>
							<TableHead className="text-right">
								{m.admin_report_days_of_cover()}
							</TableHead>
							<TableHead className="text-right max-md:hidden">
								{m.admin_report_value()}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{variants.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={8}
									className="py-10 text-center text-muted-foreground"
								>
									{m.admin_report_no_stock()}
								</TableCell>
							</TableRow>
						)}
						{variants.map((v) => (
							<TableRow key={v.variantId}>
								<TableCell className="whitespace-normal">
									<div className="grid">
										<span>
											{v.brand} {v.name}
										</span>
										<span className="type-meta text-muted-foreground">
											{v.sku}
										</span>
									</div>
								</TableCell>
								<TableCell>
									<StockStateBadge row={v} />
								</TableCell>
								<TableCell className={numeric}>{v.onHand}</TableCell>
								<TableCell className={`${numeric} max-md:hidden`}>
									{v.reorderPoint ?? report.lowStockThreshold}
								</TableCell>
								<TableCell className={numeric}>{v.unitsSold}</TableCell>
								<TableCell className={`${numeric} max-md:hidden`}>
									{v.rotation === null ? dash : decimal(v.rotation)}
								</TableCell>
								<TableCell className={numeric}>
									{v.daysOfCover === null ? dash : v.daysOfCover}
								</TableCell>
								<TableCell className={`${numeric} max-md:hidden`}>
									{money(v.value)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Section>
		</>
	);
}
