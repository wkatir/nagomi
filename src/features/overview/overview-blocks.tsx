import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ChartCard, ChartCardSkeleton } from "#/components/admin/chart-card";
import {
	overTimeKind,
	useCompactMoney,
	usePeriodLabel,
} from "#/components/admin/chart-format";
import { Section } from "#/components/admin/section";
import {
	StatCard,
	StatGrid,
	StatGridSkeleton,
} from "#/components/admin/stat-card";
import { ToneBadge } from "#/components/admin/tone-badge";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { FollowupDigest } from "#/features/orders/followups";
import { useDecimal, usePercent } from "#/features/reports/format";
import { useMoney } from "#/hooks/use-money";
import { m } from "#/paraglide/messages";
import type { AdminDashboard } from "./queries";

const SKELETON_ROWS = Array.from({ length: 4 }, (_, n) => `row-${n}`);
const numeric = "text-right tabular-nums";

function SeeAll({ children }: { children: ReactNode }) {
	return (
		<Button variant="ghost" size="sm" asChild>
			{children}
		</Button>
	);
}

function AttentionRow({
	label,
	count,
	children,
}: {
	label: string;
	count: number;
	children: (label: ReactNode) => ReactNode;
}) {
	return (
		<li className="relative flex items-center justify-between gap-3 border-b px-admin-card py-2.5 transition-colors last:border-b-0 hover:bg-muted/50 [&_a]:outline-none [&_a]:after:absolute [&_a]:after:inset-0">
			<span className="type-small">{children(label)}</span>
			<span
				data-due={count > 0}
				className="type-ui min-w-8 rounded-full bg-muted px-2 text-center font-bold tabular-nums data-[due=true]:bg-primary/15 data-[due=true]:text-primary"
			>
				{count}
			</span>
		</li>
	);
}

export function OverviewBlocks({ d }: { d: AdminDashboard }) {
	const money = useMoney();
	const compact = useCompactMoney();
	const day = usePeriodLabel();
	const percent = usePercent();
	const decimal = useDecimal();
	const days = { from: d.from, to: d.to };

	return (
		<div className="grid gap-admin-stack">
			<StatGrid className="lg:grid-cols-5">
				<StatCard
					label={
						<Link to="/admin/reports" search={days}>
							{m.admin_kpi_sales_with_tax()}
						</Link>
					}
					value={money(d.sales.revenue)}
					note={m.admin_kpi_net_note({ amount: money(d.sales.netRevenue) })}
				/>
				<StatCard
					label={
						<Link to="/admin/reports/fulfillment" search={days}>
							{m.admin_report_orders()}
						</Link>
					}
					value={String(d.sales.orders)}
					note={m.admin_kpi_orders_note({ count: d.bookings.orders })}
				/>
				<StatCard
					label={
						<Link to="/admin/reports" search={days}>
							{m.admin_kpi_avg_ticket()}
						</Link>
					}
					value={
						d.sales.averageTicket === null
							? m.admin_report_na()
							: money(d.sales.averageTicket)
					}
					note={m.admin_kpi_avg_ticket_note()}
				/>
				<StatCard
					label={
						<Link to="/admin/reports/customers" search={days}>
							{m.admin_kpi_new_customers()}
						</Link>
					}
					value={String(d.newCustomers)}
					note={m.admin_kpi_new_customers_note()}
				/>
				<StatCard
					label={
						<Link to="/admin/reports/products" search={days}>
							{m.admin_kpi_gross_margin()}
						</Link>
					}
					value={percent(d.sales.margin)}
					note={m.admin_kpi_gross_margin_note({
						amount: money(d.sales.grossProfit),
					})}
				/>
			</StatGrid>
			<div className="grid gap-admin-stack lg:grid-cols-3">
				<div className="lg:col-span-2">
					<ChartCard
						kind={overTimeKind(d.byDay.length)}
						title={m.admin_sales_by_day()}
						description={m.admin_overview_sales_chart_note()}
						categoryLabel={m.admin_report_period()}
						seriesLabel={m.admin_kpi_sales_with_tax()}
						points={d.byDay.map((x) => ({
							key: x.day,
							label: day(x.day),
							value: x.revenue,
						}))}
						formatValue={money}
						formatTick={compact}
					/>
				</div>
				<Section
					title={m.admin_overview_attention()}
					description={m.admin_overview_attention_note()}
				>
					<ul>
						<AttentionRow
							label={m.admin_overview_pending_payment()}
							count={d.pendingOrders}
						>
							{(label) => (
								<Link to="/admin/orders" search={{ status: "pending" }}>
									{label}
								</Link>
							)}
						</AttentionRow>
						<AttentionRow
							label={m.admin_followup_action_ship()}
							count={d.followups.counts.ship}
						>
							{(label) => <Link to="/admin/orders/followups">{label}</Link>}
						</AttentionRow>
						<AttentionRow
							label={m.admin_followup_action_confirm_delivery()}
							count={d.followups.counts.confirm_delivery}
						>
							{(label) => <Link to="/admin/orders/followups">{label}</Link>}
						</AttentionRow>
						<AttentionRow
							label={m.admin_overview_pending_reviews()}
							count={d.pendingReviews}
						>
							{(label) => <Link to="/admin/reviews">{label}</Link>}
						</AttentionRow>
						<AttentionRow
							label={m.admin_overview_stock_alerts()}
							count={d.pendingStockAlerts}
						>
							{(label) => <Link to="/admin/stock-alerts">{label}</Link>}
						</AttentionRow>
						<AttentionRow
							label={m.admin_stock_out_title()}
							count={d.stock.outOfStock}
						>
							{(label) => (
								<Link to="/admin/inventory" search={{ view: "out" }}>
									{label}
								</Link>
							)}
						</AttentionRow>
					</ul>
				</Section>
			</div>
			<div className="grid gap-admin-stack lg:grid-cols-2">
				<Section
					title={m.admin_top_products()}
					description={m.admin_overview_top_note()}
					action={
						<SeeAll>
							<Link to="/admin/reports/products" search={days}>
								{m.admin_overview_see_all()}
							</Link>
						</SeeAll>
					}
				>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{m.admin_report_product()}</TableHead>
								<TableHead className="text-right">
									{m.admin_report_units()}
								</TableHead>
								<TableHead className="text-right">
									{m.admin_report_merchandise()}
								</TableHead>
								<TableHead className="text-right">
									{m.admin_report_units_per_day()}
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{d.topProducts.length === 0 && (
								<TableRow>
									<TableCell
										colSpan={4}
										className="py-8 text-center text-muted-foreground"
									>
										{m.admin_no_sales()}
									</TableCell>
								</TableRow>
							)}
							{d.topProducts.map((p) => (
								<TableRow key={p.variantId}>
									<TableCell className="whitespace-normal">
										<div className="grid">
											<span>
												{p.brand} {p.name}
											</span>
											<span className="type-meta text-muted-foreground">
												{p.sku}
											</span>
										</div>
									</TableCell>
									<TableCell className={numeric}>{p.units}</TableCell>
									<TableCell className={numeric}>
										{money(p.merchandise)}
									</TableCell>
									<TableCell className={numeric}>
										{decimal(p.unitsPerDay)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Section>
				<Section
					title={m.admin_overview_low_stock()}
					description={m.admin_overview_low_stock_note({
						threshold: d.stock.threshold,
						value: money(d.stock.value),
					})}
					action={
						<SeeAll>
							<Link to="/admin/inventory" search={{ view: "low" }}>
								{m.admin_overview_see_all()}
							</Link>
						</SeeAll>
					}
				>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{m.admin_report_product()}</TableHead>
								<TableHead className="text-right">
									{m.admin_report_on_hand()}
								</TableHead>
								<TableHead className="text-right">
									{m.admin_report_reorder_point()}
								</TableHead>
								<TableHead className="text-right">
									{m.admin_report_days_of_cover()}
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{d.lowStock.length === 0 && (
								<TableRow>
									<TableCell
										colSpan={4}
										className="py-8 text-center text-muted-foreground"
									>
										{m.admin_overview_low_stock_none()}
									</TableCell>
								</TableRow>
							)}
							{d.lowStock.map((v) => (
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
									<TableCell className={numeric}>
										{v.onHand === 0 ? (
											<ToneBadge tone="danger">{m.admin_stock_out()}</ToneBadge>
										) : (
											<span className="font-bold text-warning">{v.onHand}</span>
										)}
									</TableCell>
									<TableCell className={numeric}>{v.reorderPoint}</TableCell>
									<TableCell className={numeric}>
										{v.daysOfCover ?? "—"}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Section>
			</div>
			<FollowupDigest counts={d.followups.counts} orders={d.followups.items} />
		</div>
	);
}

function ListSkeleton({ title }: { title: string }) {
	return (
		<Section title={title}>
			<div className="grid gap-4 p-admin-card">
				{SKELETON_ROWS.map((key) => (
					<Skeleton key={key} className="h-10 w-full" />
				))}
			</div>
		</Section>
	);
}

export function OverviewSkeleton() {
	return (
		<div aria-busy className="grid gap-admin-stack">
			<StatGridSkeleton count={5} className="lg:grid-cols-5" />
			<div className="grid gap-admin-stack lg:grid-cols-3">
				<div className="lg:col-span-2">
					<ChartCardSkeleton title={m.admin_sales_by_day()} />
				</div>
				<ListSkeleton title={m.admin_overview_attention()} />
			</div>
			<div className="grid gap-admin-stack lg:grid-cols-2">
				<ListSkeleton title={m.admin_top_products()} />
				<ListSkeleton title={m.admin_overview_low_stock()} />
			</div>
		</div>
	);
}
