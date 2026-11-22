import { Link } from "@tanstack/react-router";
import { ChartCard } from "#/components/admin/chart-card";
import { orderStatusLabel } from "#/components/admin/labels";
import { Section } from "#/components/admin/section";
import { StatCard, StatGrid } from "#/components/admin/stat-card";
import { OrderStatusBadge } from "#/components/admin/tone-badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { useCalendarDate } from "#/hooks/use-store-date";
import { m } from "#/paraglide/messages";
import { useDecimal, usePercent } from "./format";
import type { FulfillmentReport } from "./queries";

const numeric = "text-right tabular-nums";

export function FulfillmentReportView({
	report,
}: {
	report: FulfillmentReport;
}) {
	const decimal = useDecimal();
	const percent = usePercent();
	const formatDay = useCalendarDate();
	const count = (value: number) => String(value);
	return (
		<>
			<StatGrid className="lg:grid-cols-5">
				<StatCard
					label={m.admin_report_orders()}
					value={String(report.orders)}
					note={m.admin_report_orders_placed_note()}
				/>
				<StatCard
					label={m.admin_report_delivery_time()}
					value={
						report.averageDeliveryDays === null
							? m.admin_report_na()
							: m.admin_report_days_value({
									value: decimal(report.averageDeliveryDays),
								})
					}
					note={
						report.medianDeliveryDays === null
							? m.admin_report_no_deliveries()
							: m.admin_report_delivery_median({
									value: decimal(report.medianDeliveryDays),
									count: report.delivered,
								})
					}
				/>
				<StatCard
					label={m.admin_report_on_time()}
					value={percent(report.onTimeRate)}
					note={m.admin_report_on_time_note()}
				/>
				<StatCard
					label={m.admin_report_late()}
					value={String(report.lateOrders)}
					tone={report.lateOrders > 0 ? "warning" : undefined}
					note={m.admin_report_late_note({ count: report.lateOpen })}
				/>
				<StatCard
					label={m.admin_report_returns()}
					value={percent(report.returnRate)}
					note={m.admin_report_return_rate_note({
						count: report.returnedOrders,
					})}
				/>
			</StatGrid>
			<div className="grid gap-admin-stack lg:grid-cols-2">
				<ChartCard
					title={m.admin_report_status_chart()}
					description={m.admin_report_status_note()}
					categoryLabel={m.admin_col_status()}
					seriesLabel={m.admin_report_orders()}
					points={report.byStatus.map((s) => ({
						key: s.status,
						label: orderStatusLabel[s.status](),
						value: s.orders,
					}))}
					formatValue={count}
					formatTick={count}
				/>
				<ChartCard
					title={m.admin_report_delivery_days_chart()}
					description={m.admin_report_delivery_days_note({
						hours:
							report.averageDispatchHours === null
								? m.admin_report_na()
								: decimal(report.averageDispatchHours),
					})}
					categoryLabel={m.admin_report_days()}
					seriesLabel={m.admin_report_orders()}
					points={report.deliveryDays.map((d) => ({
						key: d.bucket,
						label: m.admin_report_days_bucket({ bucket: d.bucket }),
						value: d.orders,
					}))}
					formatValue={count}
					formatTick={count}
				/>
			</div>
			<Section
				title={m.admin_report_late_title()}
				description={m.admin_report_late_title_note()}
			>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{m.admin_col_order()}</TableHead>
							<TableHead>{m.admin_col_customer()}</TableHead>
							<TableHead>{m.admin_col_status()}</TableHead>
							<TableHead>{m.admin_report_promised_by()}</TableHead>
							<TableHead className="max-md:hidden">
								{m.admin_report_delivered_on()}
							</TableHead>
							<TableHead className="text-right">
								{m.admin_report_days_late()}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{report.late.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={6}
									className="py-10 text-center text-muted-foreground"
								>
									{m.admin_report_none_late()}
								</TableCell>
							</TableRow>
						)}
						{report.late.map((o) => (
							<TableRow key={o.id}>
								<TableCell>
									<Link
										to="/admin/orders/$id"
										params={{ id: o.id }}
										className="font-bold underline-offset-4 hover:underline"
									>
										{o.code}
									</Link>
								</TableCell>
								<TableCell className="whitespace-normal">
									{o.customerName}
								</TableCell>
								<TableCell>
									<OrderStatusBadge status={o.status} />
								</TableCell>
								<TableCell>{formatDay(o.promisedBy, "medium")}</TableCell>
								<TableCell className="max-md:hidden">
									{o.deliveredDay ? formatDay(o.deliveredDay, "medium") : "—"}
								</TableCell>
								<TableCell className={numeric}>{o.daysLate}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Section>
		</>
	);
}
