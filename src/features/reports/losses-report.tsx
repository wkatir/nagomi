import { ChartCard } from "#/components/admin/chart-card";
import { useCompactMoney } from "#/components/admin/chart-format";
import {
	movementReasonLabel,
	returnReasonLabel,
} from "#/components/admin/labels";
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
import { m } from "#/paraglide/messages";
import type { LossesReport } from "./queries";

const numeric = "text-right tabular-nums";

function EmptyRow({ columns }: { columns: number }) {
	return (
		<TableRow>
			<TableCell
				colSpan={columns}
				className="py-10 text-center text-muted-foreground"
			>
				{m.admin_report_nothing_in_range()}
			</TableCell>
		</TableRow>
	);
}

export function LossesReportView({ report }: { report: LossesReport }) {
	const money = useMoney();
	const compact = useCompactMoney();
	const { returns, refunds, writeOffs, adjustments, totalLoss } = report;
	return (
		<>
			<StatGrid>
				<StatCard
					label={m.admin_report_total_loss()}
					value={money(totalLoss)}
					note={m.admin_report_total_loss_note()}
				/>
				<StatCard
					label={m.admin_report_write_offs()}
					value={money(writeOffs.cost)}
					note={m.admin_units({ count: writeOffs.units })}
				/>
				<StatCard
					label={m.admin_report_returns()}
					value={String(returns.returns)}
					note={`${m.admin_units({ count: returns.units })} · ${money(returns.value)}`}
				/>
				<StatCard
					label={m.admin_report_refunds()}
					value={money(refunds.amount)}
					note={m.admin_report_refunds_n({ count: refunds.count })}
				/>
			</StatGrid>
			<div className="grid gap-admin-stack lg:grid-cols-2">
				<ChartCard
					title={m.admin_report_write_offs_chart()}
					categoryLabel={m.admin_report_reason()}
					seriesLabel={m.admin_report_cost()}
					points={writeOffs.byReason.map((r) => ({
						key: r.reason,
						label: movementReasonLabel[r.reason](),
						value: r.cost,
					}))}
					formatValue={money}
					formatTick={compact}
				/>
				<ChartCard
					title={m.admin_report_returns_chart()}
					categoryLabel={m.admin_report_reason()}
					seriesLabel={m.admin_report_value()}
					points={returns.byReason.map((r) => ({
						key: r.reason,
						label: returnReasonLabel[r.reason](),
						value: r.value,
					}))}
					formatValue={money}
					formatTick={compact}
				/>
			</div>
			<div className="grid gap-admin-stack lg:grid-cols-2">
				<Section title={m.admin_report_write_offs()}>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{m.admin_report_reason()}</TableHead>
								<TableHead className="text-right">
									{m.admin_report_units()}
								</TableHead>
								<TableHead className="text-right">
									{m.admin_report_cost()}
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{writeOffs.byReason.length === 0 && <EmptyRow columns={3} />}
							{writeOffs.byReason.map((r) => (
								<TableRow key={r.reason}>
									<TableCell>{movementReasonLabel[r.reason]()}</TableCell>
									<TableCell className={numeric}>{r.units}</TableCell>
									<TableCell className={numeric}>{money(r.cost)}</TableCell>
								</TableRow>
							))}
						</TableBody>
						<TableFooter>
							<TableRow>
								<TableCell>{m.admin_report_total()}</TableCell>
								<TableCell className={numeric}>{writeOffs.units}</TableCell>
								<TableCell className={numeric}>
									{money(writeOffs.cost)}
								</TableCell>
							</TableRow>
						</TableFooter>
					</Table>
				</Section>
				<Section title={m.admin_report_returns()}>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{m.admin_report_reason()}</TableHead>
								<TableHead className="text-right">
									{m.admin_report_returns()}
								</TableHead>
								<TableHead className="text-right max-md:hidden">
									{m.admin_report_units()}
								</TableHead>
								<TableHead className="text-right">
									{m.admin_report_value()}
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{returns.byReason.length === 0 && <EmptyRow columns={4} />}
							{returns.byReason.map((r) => (
								<TableRow key={r.reason}>
									<TableCell>{returnReasonLabel[r.reason]()}</TableCell>
									<TableCell className={numeric}>{r.returns}</TableCell>
									<TableCell className={`${numeric} max-md:hidden`}>
										{r.units}
									</TableCell>
									<TableCell className={numeric}>{money(r.value)}</TableCell>
								</TableRow>
							))}
						</TableBody>
						<TableFooter>
							<TableRow>
								<TableCell>{m.admin_report_total()}</TableCell>
								<TableCell className={numeric}>{returns.returns}</TableCell>
								<TableCell className={`${numeric} max-md:hidden`}>
									{returns.units}
								</TableCell>
								<TableCell className={numeric}>
									{money(returns.value)}
								</TableCell>
							</TableRow>
						</TableFooter>
					</Table>
				</Section>
			</div>
			<Section title={m.admin_report_other_figures()}>
				<dl className="type-small grid gap-3 p-admin-card tabular-nums sm:grid-cols-3">
					<div className="grid gap-0.5">
						<dt className="text-muted-foreground">
							{m.admin_report_returns_restocked()}
						</dt>
						<dd>
							{m.admin_units({ count: returns.restocked.units })} ·{" "}
							{money(returns.restocked.cost)}
						</dd>
					</div>
					<div className="grid gap-0.5">
						<dt className="text-muted-foreground">
							{m.admin_report_returns_written_off()}
						</dt>
						<dd>
							{m.admin_units({ count: returns.writtenOff.units })} ·{" "}
							{money(returns.writtenOff.cost)}
						</dd>
					</div>
					<div className="grid gap-0.5">
						<dt className="text-muted-foreground">
							{m.admin_report_adjustments()}
						</dt>
						<dd>
							{m.admin_units({ count: adjustments.units })} ·{" "}
							{money(adjustments.value)}
						</dd>
					</div>
				</dl>
			</Section>
		</>
	);
}
