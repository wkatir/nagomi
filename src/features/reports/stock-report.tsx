import { Section } from "#/components/admin/section";
import { StatCard, StatGrid } from "#/components/admin/stat-card";
import { Badge } from "#/components/ui/badge";
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
import type { StockReport } from "./queries";

const numeric = "text-right tabular-nums";

export function StockReportView({ report }: { report: StockReport }) {
	const money = useMoney();
	const formatDay = useCalendarDate();
	const { totals, variants, expiringLots, expiryWindowDays } = report;
	return (
		<>
			<StatGrid>
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
					label={m.admin_report_expiring_soon()}
					value={String(totals.atRiskUnits)}
					note={`${money(totals.atRiskValue)} · ${m.admin_report_within_days({ days: expiryWindowDays })}`}
				/>
				<StatCard
					label={m.admin_report_expired()}
					value={String(totals.expiredUnits)}
					note={`${money(totals.expiredValue)} · ${m.admin_report_to_write_off()}`}
				/>
			</StatGrid>
			<Section title={m.admin_report_stock_by_size()}>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{m.admin_report_product()}</TableHead>
							<TableHead className="text-right">
								{m.admin_report_on_hand()}
							</TableHead>
							<TableHead className="text-right">
								{m.admin_report_value()}
							</TableHead>
							<TableHead className="text-right max-md:hidden">
								{m.admin_report_expiring_soon()}
							</TableHead>
							<TableHead className="text-right max-md:hidden">
								{m.admin_report_expired()}
							</TableHead>
							<TableHead className="text-right max-md:hidden">
								{m.admin_report_reorder_point()}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{variants.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={6}
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
								<TableCell className={numeric}>{v.onHand}</TableCell>
								<TableCell className={numeric}>{money(v.value)}</TableCell>
								<TableCell className={`${numeric} max-md:hidden`}>
									{v.atRiskUnits}
								</TableCell>
								<TableCell className={`${numeric} max-md:hidden`}>
									{v.expiredUnits}
								</TableCell>
								<TableCell className={`${numeric} max-md:hidden`}>
									{v.reorderPoint === null ? (
										m.admin_report_na()
									) : v.belowReorderPoint ? (
										<Badge variant="secondary">
											{m.admin_report_below_point({ point: v.reorderPoint })}
										</Badge>
									) : (
										v.reorderPoint
									)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Section>
			<Section title={m.admin_expiring({ days: expiryWindowDays })}>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{m.admin_report_lot()}</TableHead>
							<TableHead>{m.admin_report_expires()}</TableHead>
							<TableHead className="text-right">
								{m.admin_report_units()}
							</TableHead>
							<TableHead className="text-right max-md:hidden">
								{m.admin_report_value()}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{expiringLots.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={4}
									className="py-10 text-center text-muted-foreground"
								>
									{m.admin_nothing_expiring()}
								</TableCell>
							</TableRow>
						)}
						{expiringLots.map((lot) => (
							<TableRow key={lot.lotId}>
								<TableCell>
									<div className="grid">
										<span>
											{m.admin_batch({ code: lot.code ?? `#${lot.lotId}` })}
										</span>
										<span className="type-meta text-muted-foreground">
											{lot.sku}
										</span>
									</div>
								</TableCell>
								<TableCell>
									<div className="grid">
										<span>{lot.expiry}</span>
										<span className="type-meta text-muted-foreground">
											{m.admin_report_days_left({ count: lot.daysLeft })}
										</span>
									</div>
								</TableCell>
								<TableCell className={numeric}>{lot.available}</TableCell>
								<TableCell className={`${numeric} max-md:hidden`}>
									{money(lot.value)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Section>
		</>
	);
}
