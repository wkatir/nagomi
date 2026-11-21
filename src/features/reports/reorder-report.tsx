import { Section } from "#/components/admin/section";
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
import type { ReorderReport } from "./queries";
import { reorderReasonLabel } from "./reorder-labels";

const numeric = "text-right tabular-nums";

export function ReorderReportView({ report }: { report: ReorderReport }) {
	const formatDay = useCalendarDate();
	const toOrder = report.variants.filter((v) => v.orderQuantity > 0).length;
	return (
		<Section
			title={m.admin_report_to_order({ count: toOrder })}
			description={m.admin_report_reorder_basis({
				lookback: report.lookbackWeeks,
				target: report.targetWeeks,
				date: formatDay(report.asOf),
			})}
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{m.admin_report_product()}</TableHead>
						<TableHead className="text-right">
							{m.admin_report_on_hand()}
						</TableHead>
						<TableHead className="text-right max-md:hidden">
							{m.admin_report_per_week()}
						</TableHead>
						<TableHead className="text-right max-md:hidden">
							{m.admin_report_days_of_cover()}
						</TableHead>
						<TableHead className="text-right">
							{m.admin_report_order_quantity()}
						</TableHead>
						<TableHead className="max-md:hidden">
							{m.admin_report_supplier()}
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{report.variants.length === 0 && (
						<TableRow>
							<TableCell
								colSpan={6}
								className="py-10 text-center text-muted-foreground"
							>
								{m.admin_report_no_stock()}
							</TableCell>
						</TableRow>
					)}
					{report.variants.map((v) => (
						<TableRow key={v.variantId}>
							<TableCell className="whitespace-normal">
								<div className="grid">
									<span>
										{v.brand} {v.name}
									</span>
									<span className="type-meta text-muted-foreground">
										{[
											v.sku,
											...v.reasons.map((r) => reorderReasonLabel[r]()),
										].join(" · ")}
									</span>
								</div>
							</TableCell>
							<TableCell className={numeric}>{v.onHand}</TableCell>
							<TableCell className={`${numeric} max-md:hidden`}>
								{v.ratePerWeek}
							</TableCell>
							<TableCell className={`${numeric} max-md:hidden`}>
								{v.daysOfCover ?? m.admin_report_na()}
							</TableCell>
							<TableCell className={`${numeric} font-bold`}>
								{v.orderQuantity}
							</TableCell>
							<TableCell className="max-md:hidden">
								{v.supplier?.supplier ?? m.admin_report_na()}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</Section>
	);
}
