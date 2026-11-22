import { ChartCard } from "#/components/admin/chart-card";
import { useCompactMoney } from "#/components/admin/chart-format";
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
import { useCalendarDate } from "#/hooks/use-store-date";
import type { ProductRank } from "#/lib/schemas/reports";
import { m } from "#/paraglide/messages";
import { useDecimal, usePercent } from "./format";
import type { BrandsReport, ProductsReport } from "./queries";

const CHART_ROWS = 10;

type Figures = {
	orders: number;
	unitsSold: number;
	unitsReturned: number;
	units: number;
	merchandise: number;
	costOfGoodsSold: number;
	grossProfit: number;
	margin: number | null;
};

const numeric = "text-right tabular-nums";

function FigureHeads() {
	return (
		<>
			<TableHead className="text-right max-md:hidden">
				{m.admin_report_orders()}
			</TableHead>
			<TableHead className="text-right">
				{m.admin_report_units_sold()}
			</TableHead>
			<TableHead className="text-right max-md:hidden">
				{m.admin_report_returned()}
			</TableHead>
			<TableHead className="text-right">
				{m.admin_report_merchandise()}
			</TableHead>
			<TableHead className="text-right max-md:hidden">
				{m.admin_kpi_cogs()}
			</TableHead>
			<TableHead className="text-right">{m.admin_kpi_gross_profit()}</TableHead>
			<TableHead className="text-right max-md:hidden">
				{m.admin_report_margin()}
			</TableHead>
		</>
	);
}

function FigureCells({ row }: { row: Figures }) {
	const money = useMoney();
	const percent = usePercent();
	return (
		<>
			<TableCell className={`${numeric} max-md:hidden`}>{row.orders}</TableCell>
			<TableCell className={numeric}>{row.unitsSold}</TableCell>
			<TableCell className={`${numeric} max-md:hidden`}>
				{row.unitsReturned}
			</TableCell>
			<TableCell className={numeric}>{money(row.merchandise)}</TableCell>
			<TableCell className={`${numeric} max-md:hidden`}>
				{money(row.costOfGoodsSold)}
			</TableCell>
			<TableCell className={numeric}>{money(row.grossProfit)}</TableCell>
			<TableCell className={`${numeric} max-md:hidden`}>
				{percent(row.margin)}
			</TableCell>
		</>
	);
}

// `totals.units` counts the units the customer kept, so sold and returned are summed from the rows.
function totalsRow(
	totals: ProductsReport["totals"],
	rows: Pick<Figures, "unitsSold" | "unitsReturned">[],
): Figures {
	return {
		orders: totals.orders,
		unitsSold: rows.reduce((n, r) => n + r.unitsSold, 0),
		unitsReturned: rows.reduce((n, r) => n + r.unitsReturned, 0),
		units: totals.units,
		merchandise: totals.merchandise,
		costOfGoodsSold: totals.costOfGoodsSold,
		grossProfit: totals.grossProfit,
		margin: totals.margin,
	};
}

function Totals({ totals }: { totals: ProductsReport["totals"] }) {
	const money = useMoney();
	const percent = usePercent();
	return (
		<StatGrid>
			<StatCard
				label={m.admin_report_merchandise()}
				value={money(totals.merchandise)}
				note={m.admin_report_merchandise_note()}
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
			<StatCard label={m.admin_report_orders()} value={String(totals.orders)} />
		</StatGrid>
	);
}

type ProductRow = ProductsReport["products"][number];

export const rankValue: Record<ProductRank, (p: ProductRow) => number> = {
	merchandise: (p) => p.merchandise,
	units: (p) => p.units,
	unitsPerDay: (p) => p.unitsPerDay,
};

export const rankLabel: Record<ProductRank, () => string> = {
	merchandise: m.admin_report_merchandise,
	units: m.admin_report_units,
	unitsPerDay: m.admin_report_units_per_day,
};

export function rankProducts(products: ProductRow[], rank: ProductRank) {
	const value = rankValue[rank];
	return [...products].sort(
		(a, b) =>
			value(b) - value(a) ||
			b.merchandise - a.merchandise ||
			a.sku.localeCompare(b.sku),
	);
}

export function ProductsReportView({
	report,
	rank,
}: {
	report: ProductsReport;
	rank: ProductRank;
}) {
	const money = useMoney();
	const compact = useCompactMoney();
	const formatDay = useCalendarDate();
	const decimal = useDecimal();
	const { totals } = report;
	const products = rankProducts(report.products, rank);
	const format = rank === "merchandise" ? money : decimal;
	return (
		<>
			<Totals totals={totals} />
			<ChartCard
				kind="hbar"
				title={m.admin_report_products_chart_by({
					count: CHART_ROWS,
					metric: rankLabel[rank](),
				})}
				description={m.admin_report_products_rank_note()}
				categoryLabel={m.admin_report_product()}
				seriesLabel={rankLabel[rank]()}
				points={products.slice(0, CHART_ROWS).map((p) => ({
					key: String(p.variantId),
					label: p.sku,
					value: rankValue[rank](p),
				}))}
				formatValue={format}
				formatTick={rank === "merchandise" ? compact : decimal}
			/>
			<Section title={m.admin_report_detail()}>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{m.admin_report_product()}</TableHead>
							<FigureHeads />
							<TableHead className="text-right">
								{m.admin_report_units_per_day()}
							</TableHead>
							<TableHead className="max-md:hidden">
								{m.admin_report_first_sale()}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{products.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={10}
									className="py-10 text-center text-muted-foreground"
								>
									{m.admin_report_no_sales()}
								</TableCell>
							</TableRow>
						)}
						{products.map((p) => (
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
								<FigureCells row={p} />
								<TableCell className={numeric}>
									{decimal(p.unitsPerDay)}
								</TableCell>
								<TableCell className="max-md:hidden">
									<div className="grid">
										<span>{formatDay(p.firstSoldOn)}</span>
										<span className="type-meta text-muted-foreground">
											{m.admin_report_days_on_sale({ count: p.daysOnSale })}
										</span>
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
					{products.length > 0 && (
						<TableFooter>
							<TableRow>
								<TableCell>{m.admin_report_total()}</TableCell>
								<FigureCells row={totalsRow(totals, products)} />
								<TableCell />
								<TableCell className="max-md:hidden" />
							</TableRow>
						</TableFooter>
					)}
				</Table>
			</Section>
		</>
	);
}

export function BrandsReportView({ report }: { report: BrandsReport }) {
	const money = useMoney();
	const compact = useCompactMoney();
	const { totals, brands } = report;
	return (
		<>
			<Totals totals={totals} />
			<ChartCard
				title={m.admin_report_brands_chart()}
				categoryLabel={m.admin_report_brand()}
				seriesLabel={m.admin_report_merchandise()}
				points={brands.map((b) => ({
					key: b.brand,
					label: b.brand,
					value: b.merchandise,
				}))}
				formatValue={money}
				formatTick={compact}
			/>
			<Section title={m.admin_report_detail()}>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{m.admin_report_brand()}</TableHead>
							<FigureHeads />
						</TableRow>
					</TableHeader>
					<TableBody>
						{brands.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={8}
									className="py-10 text-center text-muted-foreground"
								>
									{m.admin_report_no_sales()}
								</TableCell>
							</TableRow>
						)}
						{brands.map((b) => (
							<TableRow key={b.brand}>
								<TableCell>
									<div className="grid">
										<span>{b.brand}</span>
										<span className="type-meta text-muted-foreground">
											{m.admin_report_products_n({ count: b.products })}
										</span>
									</div>
								</TableCell>
								<FigureCells row={b} />
							</TableRow>
						))}
					</TableBody>
					{brands.length > 0 && (
						<TableFooter>
							<TableRow>
								<TableCell>{m.admin_report_total()}</TableCell>
								<FigureCells row={totalsRow(totals, brands)} />
							</TableRow>
						</TableFooter>
					)}
				</Table>
			</Section>
		</>
	);
}
