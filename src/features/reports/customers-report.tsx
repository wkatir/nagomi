import { Link } from "@tanstack/react-router";
import { ChartCard, ShareChartCard } from "#/components/admin/chart-card";
import { customerSegmentLabel } from "#/components/admin/labels";
import { Section } from "#/components/admin/section";
import { StatCard, StatGrid } from "#/components/admin/stat-card";
import { CustomerSegmentBadge, ToneBadge } from "#/components/admin/tone-badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { useMoney } from "#/hooks/use-money";
import { useStoreDate } from "#/hooks/use-store-date";
import { m } from "#/paraglide/messages";
import { useDecimal } from "./format";
import type { CustomersReport } from "./queries";

const numeric = "text-right tabular-nums";

export function CustomersReportView({ report }: { report: CustomersReport }) {
	const money = useMoney();
	const decimal = useDecimal();
	const formatDate = useStoreDate();
	const count = (value: number) => String(value);
	return (
		<>
			<StatGrid className="lg:grid-cols-5">
				<StatCard
					label={m.admin_report_buyers()}
					value={String(report.buyers)}
					note={m.admin_report_orders_n({ count: report.orders })}
				/>
				<StatCard
					label={m.admin_kpi_new_customers()}
					value={String(report.newBuyers)}
					note={m.admin_kpi_new_customers_note()}
				/>
				<StatCard
					label={m.admin_report_returning()}
					value={String(report.returningBuyers)}
					note={m.admin_report_returning_note()}
				/>
				<StatCard
					label={m.admin_report_orders_per_buyer()}
					value={
						report.ordersPerBuyer === null
							? m.admin_report_na()
							: decimal(report.ordersPerBuyer)
					}
					note={m.admin_report_orders_per_buyer_note()}
				/>
				<StatCard
					label={m.admin_report_value_per_buyer()}
					value={
						report.valuePerBuyer === null
							? m.admin_report_na()
							: money(report.valuePerBuyer)
					}
					note={m.admin_report_value_per_buyer_note()}
				/>
			</StatGrid>
			<div className="grid gap-admin-stack lg:grid-cols-2">
				<ChartCard
					title={m.admin_report_frequency_chart()}
					description={m.admin_report_frequency_note()}
					categoryLabel={m.admin_report_purchases()}
					seriesLabel={m.admin_report_buyers()}
					points={report.frequency.map((f) => ({
						key: f.orders,
						label: m.admin_report_purchases_n({ count: f.orders }),
						value: f.buyers,
					}))}
					formatValue={count}
					formatTick={count}
				/>
				<ShareChartCard
					title={m.admin_report_segments_chart()}
					description={m.admin_report_segments_note()}
					categoryLabel={m.admin_customer_col_segment()}
					seriesLabel={m.admin_nav_customers()}
					parts={report.segments.map((s) => ({
						key: s.segment,
						label: customerSegmentLabel[s.segment](),
						value: s.customers,
					}))}
					formatValue={count}
				/>
			</div>
			<Section
				title={m.admin_report_top_buyers()}
				description={m.admin_report_top_buyers_note()}
			>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{m.admin_col_customer()}</TableHead>
							<TableHead>{m.admin_customer_col_segment()}</TableHead>
							<TableHead className="text-right">
								{m.admin_report_orders()}
							</TableHead>
							<TableHead className="text-right">
								{m.admin_report_value()}
							</TableHead>
							<TableHead className="max-md:hidden">
								{m.admin_customer_col_last_order()}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{report.topBuyers.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={5}
									className="py-10 text-center text-muted-foreground"
								>
									{m.admin_report_nothing_in_range()}
								</TableCell>
							</TableRow>
						)}
						{report.topBuyers.map((b) => (
							<TableRow key={b.customerId}>
								<TableCell className="whitespace-normal">
									<div className="grid">
										<Link
											to="/admin/customers/$id"
											params={{ id: b.customerId }}
											className="font-medium underline-offset-4 hover:underline"
										>
											{b.name ?? b.email ?? m.admin_customer_no_name()}
										</Link>
										{b.email && (
											<span className="type-meta text-muted-foreground">
												{b.email}
											</span>
										)}
									</div>
								</TableCell>
								<TableCell>
									<div className="flex flex-wrap gap-1">
										<CustomerSegmentBadge segment={b.segment} />
										{b.isNew && (
											<ToneBadge tone="accent">
												{m.admin_report_first_purchase()}
											</ToneBadge>
										)}
									</div>
								</TableCell>
								<TableCell className={numeric}>{b.orders}</TableCell>
								<TableCell className={numeric}>{money(b.value)}</TableCell>
								<TableCell className="max-md:hidden">
									{formatDate(b.lastOrderAt, { dateStyle: "medium" })}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Section>
		</>
	);
}
