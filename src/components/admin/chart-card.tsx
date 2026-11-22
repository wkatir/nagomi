import { lazy, type ReactNode, Suspense } from "react";
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
import { MAX_SHARE_PARTS, SHARE_COLORS } from "./chart-format";
import type { ChartKind, ChartPoint } from "./series-chart";

const SeriesChart = lazy(() => import("./series-chart"));
const ShareChart = lazy(() => import("./share-chart"));

function ChartSkeleton() {
	return <Skeleton aria-hidden className="h-60 w-full" />;
}

function ScreenReaderTable({
	title,
	categoryLabel,
	seriesLabel,
	points,
	formatValue,
}: {
	title: string;
	categoryLabel: string;
	seriesLabel: string;
	points: ChartPoint[];
	formatValue: (value: number) => string;
}) {
	return (
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
	);
}

function EmptyChart() {
	return (
		<p className="type-small py-16 text-center text-muted-foreground">
			{m.admin_report_chart_empty()}
		</p>
	);
}

export function ChartCard({
	title,
	description,
	kind = "bar",
	categoryLabel,
	seriesLabel,
	points,
	formatValue,
	formatTick,
	action,
}: {
	title: string;
	description?: ReactNode;
	kind?: ChartKind;
	categoryLabel: string;
	seriesLabel: string;
	points: ChartPoint[];
	formatValue: (value: number) => string;
	formatTick: (value: number) => string;
	action?: ReactNode;
}) {
	const empty = points.every((point) => point.value === 0);
	return (
		<Section title={title} description={description} action={action}>
			<div className="p-admin-card">
				{empty ? (
					<EmptyChart />
				) : (
					<>
						<Suspense fallback={<ChartSkeleton />}>
							<SeriesChart
								title={title}
								kind={kind}
								points={points}
								seriesLabel={seriesLabel}
								formatValue={formatValue}
								formatTick={formatTick}
							/>
						</Suspense>
						<ScreenReaderTable
							title={title}
							categoryLabel={categoryLabel}
							seriesLabel={seriesLabel}
							points={points}
							formatValue={formatValue}
						/>
					</>
				)}
			</div>
		</Section>
	);
}

export function ShareChartCard({
	title,
	description,
	categoryLabel,
	seriesLabel,
	parts,
	formatValue,
}: {
	title: string;
	description?: ReactNode;
	categoryLabel: string;
	seriesLabel: string;
	parts: ChartPoint[];
	formatValue: (value: number) => string;
}) {
	if (parts.length > MAX_SHARE_PARTS)
		throw new Error(
			`A pie shows at most ${MAX_SHARE_PARTS} parts, got ${parts.length}`,
		);
	const total = parts.reduce((n, part) => n + part.value, 0);
	const share = (value: number) =>
		total === 0 ? "0 %" : `${Math.round((value / total) * 100)} %`;
	return (
		<Section title={title} description={description}>
			<div className="p-admin-card">
				{total === 0 ? (
					<EmptyChart />
				) : (
					<div className="grid items-center gap-4 sm:grid-cols-[minmax(0,13rem)_1fr]">
						<Suspense
							fallback={<Skeleton aria-hidden className="h-52 w-full" />}
						>
							<ShareChart
								title={title}
								parts={parts}
								formatValue={formatValue}
							/>
						</Suspense>
						<ul className="grid gap-2">
							{parts.map((part, n) => (
								<li
									key={part.key}
									className="type-small flex items-center justify-between gap-3"
								>
									<span className="flex min-w-0 items-center gap-2">
										<span
											aria-hidden
											className="size-2.5 shrink-0 rounded-full"
											style={{ backgroundColor: SHARE_COLORS[n] }}
										/>
										{part.label}
									</span>
									<span className="tabular-nums">
										{formatValue(part.value)}
										<span className="ml-2 text-muted-foreground">
											{share(part.value)}
										</span>
									</span>
								</li>
							))}
						</ul>
						<ScreenReaderTable
							title={title}
							categoryLabel={categoryLabel}
							seriesLabel={seriesLabel}
							points={parts}
							formatValue={formatValue}
						/>
					</div>
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
