import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ChartCard, ChartCardSkeleton } from "#/components/admin/chart-card";
import {
	useCompactMoney,
	usePeriodLabel,
} from "#/components/admin/chart-format";
import { QueryError } from "#/components/admin/query-error";
import { Section } from "#/components/admin/section";
import {
	StatCard,
	StatGrid,
	StatGridSkeleton,
} from "#/components/admin/stat-card";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { invoiceAttentionQuery } from "#/features/invoices/queries";
import { usePercent } from "#/features/reports/format";
import { useMoney } from "#/hooks/use-money";
import { m } from "#/paraglide/messages";
import type { AdminDashboard } from "./queries";

// The stock report lists them all.
const EXPIRING_SHOWN = 8;

const SKELETON_ROWS = Array.from({ length: 4 }, (_, n) => `row-${n}`);

const ListRow = ({ children }: { children: ReactNode }) => (
	<li className="flex items-start justify-between gap-4 border-b px-admin-card py-3 last:border-b-0">
		{children}
	</li>
);

// It loads on its own, so the other figures never wait for it.
function InvoicesToReview() {
	const query = useQuery(invoiceAttentionQuery);
	if (query.isError)
		return <QueryError error={query.error} onRetry={() => query.refetch()} />;
	// Nothing while it loads or while invoicing is off.
	if (!query.data?.configured) return null;
	const { refused, waiting, stuck } = query.data;
	const count = refused + waiting + stuck;
	return (
		<StatCard
			label={<Link to="/admin/invoices">{m.admin_overview_invoices()}</Link>}
			value={String(count)}
			note={m.admin_overview_invoices_note()}
			tone={count > 0 ? "destructive" : undefined}
		/>
	);
}

function SeeAll({ children }: { children: ReactNode }) {
	return (
		<Button variant="ghost" size="sm" asChild>
			{children}
		</Button>
	);
}

export function OverviewBlocks({ d }: { d: AdminDashboard }) {
	const money = useMoney();
	const compact = useCompactMoney();
	const day = usePeriodLabel();
	const percent = usePercent();
	const days = { from: d.from, to: d.to };
	const points = (value: (x: AdminDashboard["byDay"][number]) => number) =>
		d.byDay.map((x) => ({ key: x.day, label: day(x.day), value: value(x) }));
	const lots = d.expiring.slice(0, EXPIRING_SHOWN);

	return (
		<div className="grid gap-admin-stack">
			<StatGrid>
				<StatCard
					label={
						<Link to="/admin/reports" search={days}>
							{m.admin_kpi_revenue()}
						</Link>
					}
					value={money(d.sales.revenue)}
					note={m.admin_overview_sales_note({ count: d.sales.orders })}
				/>
				<StatCard
					label={
						<Link to="/admin/reports/products" search={days}>
							{m.admin_kpi_gross_profit()}
						</Link>
					}
					value={money(d.sales.grossProfit)}
					note={
						d.sales.margin === null
							? m.admin_kpi_no_fulfilled()
							: m.admin_report_margin_n({ percent: percent(d.sales.margin) })
					}
				/>
				<StatCard
					label={
						<Link to="/admin/orders" search={{ status: "pending" }}>
							{m.admin_kpi_pending()}
						</Link>
					}
					value={String(d.pendingOrders)}
					note={m.admin_overview_pending_note()}
				/>
				<StatCard
					label={
						<Link
							to="/admin/orders"
							search={{ status: "pending", sort: "createdAt", dir: "asc" }}
						>
							{m.admin_overview_overdue()}
						</Link>
					}
					value={String(d.overduePendingOrders)}
					note={m.admin_overview_overdue_note()}
				/>
				<StatCard
					label={<Link to="/admin/orders">{m.admin_overview_booked()}</Link>}
					value={String(d.bookings.orders)}
					note={m.admin_overview_booked_note({
						amount: money(d.bookings.value),
					})}
				/>
				<StatCard
					label={
						<Link to="/admin/reports/losses" search={days}>
							{m.admin_overview_losses()}
						</Link>
					}
					value={money(d.losses.totalLoss)}
					note={m.admin_overview_losses_note()}
				/>
				<StatCard
					label={
						<Link to="/admin/reports/reorder">
							{m.admin_overview_below_reorder()}
						</Link>
					}
					value={String(d.stock.belowReorderPoint)}
					note={m.admin_overview_below_reorder_note()}
				/>
				<StatCard
					label={
						<Link to="/admin/reports/stock">{m.admin_overview_stock()}</Link>
					}
					value={money(d.stock.value)}
					note={m.admin_overview_stock_note({ count: d.stock.onHand })}
				/>
				<InvoicesToReview />
			</StatGrid>
			<div className="grid gap-admin-stack lg:grid-cols-2">
				<ChartCard
					title={m.admin_sales_by_day()}
					categoryLabel={m.admin_report_period()}
					seriesLabel={m.admin_kpi_revenue()}
					points={points((x) => x.revenue)}
					formatValue={money}
					formatTick={compact}
				/>
				<ChartCard
					title={m.admin_overview_profit_by_day()}
					categoryLabel={m.admin_report_period()}
					seriesLabel={m.admin_kpi_gross_profit()}
					points={points((x) => x.grossProfit)}
					formatValue={money}
					formatTick={compact}
				/>
			</div>
			<div className="grid gap-admin-stack lg:grid-cols-2">
				<Section
					title={m.admin_top_products()}
					action={
						<SeeAll>
							<Link to="/admin/reports/products" search={days}>
								{m.admin_overview_see_all()}
							</Link>
						</SeeAll>
					}
				>
					<ul>
						{d.topProducts.map((p) => (
							<ListRow key={p.variantId}>
								<div className="grid min-w-0">
									<span className="type-small break-words">
										{p.brand} {p.name}
									</span>
									<span className="type-meta text-muted-foreground">
										{p.sku}
									</span>
								</div>
								<div className="grid shrink-0 text-right tabular-nums">
									<span className="type-small font-bold">
										{money(p.merchandise)}
									</span>
									<span className="type-meta text-muted-foreground">
										{m.admin_units({ count: p.units })}
									</span>
								</div>
							</ListRow>
						))}
						{d.topProducts.length === 0 && (
							<li className="type-small p-admin-card text-muted-foreground">
								{m.admin_no_sales()}
							</li>
						)}
					</ul>
				</Section>
				<Section
					title={m.admin_overview_expiring()}
					description={m.admin_overview_within_days({
						days: d.stock.expiryWindowDays,
					})}
					action={
						<SeeAll>
							<Link to="/admin/reports/stock">
								{m.admin_overview_see_all()}
							</Link>
						</SeeAll>
					}
				>
					<ul>
						{lots.map((lot) => (
							<ListRow key={lot.lotId}>
								<div className="grid min-w-0">
									<span className="type-small break-words">
										{m.admin_batch({ code: lot.code ?? `#${lot.lotId}` })}
									</span>
									<span className="type-meta text-muted-foreground">
										{lot.sku}
									</span>
								</div>
								<div className="grid shrink-0 text-right tabular-nums">
									<span className="type-small font-bold">
										{m.admin_units({ count: lot.available })}
									</span>
									<span className="type-meta text-muted-foreground">
										{lot.expiry} ·{" "}
										{m.admin_report_days_left({ count: lot.daysLeft })}
									</span>
								</div>
							</ListRow>
						))}
						{lots.length === 0 && (
							<li className="type-small p-admin-card text-muted-foreground">
								{m.admin_nothing_expiring()}
							</li>
						)}
						{d.expiring.length > lots.length && (
							<li className="type-meta p-admin-card text-muted-foreground">
								{m.admin_overview_more_lots({
									count: d.expiring.length - lots.length,
								})}
							</li>
						)}
					</ul>
				</Section>
			</div>
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
			<StatGridSkeleton count={8} />
			<div className="grid gap-admin-stack lg:grid-cols-2">
				<ChartCardSkeleton title={m.admin_sales_by_day()} />
				<ChartCardSkeleton title={m.admin_overview_profit_by_day()} />
			</div>
			<div className="grid gap-admin-stack lg:grid-cols-2">
				<ListSkeleton title={m.admin_top_products()} />
				<ListSkeleton title={m.admin_overview_expiring()} />
			</div>
		</div>
	);
}
