import { lazy, Suspense } from "react";
import { Section } from "#/components/admin/section";
import { Skeleton } from "#/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { m } from "#/paraglide/messages";
import type { ChartPoint } from "./series-chart";

const SeriesChart = lazy(() => import("./series-chart"));

function ChartSkeleton() {
	return <Skeleton aria-hidden className="h-60 w-full" />;
}

// The chart code loads on demand, so Recharts is not part of the screens that have no chart.
export function ChartCard({
	title,
	categoryLabel,
	seriesLabel,
	points,
	formatValue,
	formatTick,
}: {
	title: string;
	categoryLabel: string;
	seriesLabel: string;
	points: ChartPoint[];
	formatValue: (value: number) => string;
	formatTick: (value: number) => string;
}) {
	const empty = points.every((point) => point.value === 0);
	return (
		<Section title={title}>
			<div className="p-admin-card">
				{empty ? (
					<p className="type-small py-16 text-center text-muted-foreground">
						{m.admin_report_chart_empty()}
					</p>
				) : (
					<>
						<Suspense fallback={<ChartSkeleton />}>
							<SeriesChart
								title={title}
								points={points}
								seriesLabel={seriesLabel}
								formatValue={formatValue}
								formatTick={formatTick}
							/>
						</Suspense>
						<Table className="sr-only">
							<caption>{title}</caption>
							<TableHeader>
								<TableRow>
									<TableHead>{categoryLabel}</TableHead>
									<TableHead>{seriesLabel}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{points.map((point) => (
									<TableRow key={point.key}>
										<TableCell>{point.label}</TableCell>
										<TableCell>{formatValue(point.value)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</>
				)}
			</div>
		</Section>
	);
}

export function ChartCardSkeleton({ title }: { title: string }) {
	return (
		<Section title={title}>
			<div className="p-admin-card">
				<ChartSkeleton />
			</div>
		</Section>
	);
}
