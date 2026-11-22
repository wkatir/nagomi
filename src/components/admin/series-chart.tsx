import {
	Bar,
	BarChart,
	CartesianGrid,
	Line,
	LineChart,
	XAxis,
	YAxis,
} from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "#/components/ui/chart";

export type ChartPoint = { key: string; label: string; value: number };

export type ChartKind = "bar" | "line" | "hbar";

export default function SeriesChart({
	title,
	kind,
	points,
	seriesLabel,
	formatValue,
	formatTick,
}: {
	title: string;
	kind: ChartKind;
	points: ChartPoint[];
	seriesLabel: string;
	formatValue: (value: number) => string;
	formatTick: (value: number) => string;
}) {
	const config: ChartConfig = {
		value: { label: seriesLabel, color: "var(--chart-1)" },
	};
	const labelOf = (key: unknown) => {
		const point = points.find((p) => p.key === key);
		if (!point) throw new Error(`No chart point ${String(key)}`);
		return point.label;
	};
	const tooltip = (
		<ChartTooltip
			cursor={kind === "line"}
			content={
				<ChartTooltipContent
					hideIndicator
					labelFormatter={labelOf}
					formatter={(value) => {
						if (typeof value !== "number")
							throw new Error(`Chart value ${String(value)} is not a number`);
						return (
							<div className="flex w-full items-center justify-between gap-4">
								<span className="text-muted-foreground">{seriesLabel}</span>
								<span className="font-medium tabular-nums">
									{formatValue(value)}
								</span>
							</div>
						);
					}}
				/>
			}
		/>
	);
	const categoryAxis = {
		dataKey: "key",
		tickFormatter: labelOf,
		tickLine: false,
		axisLine: false,
		tickMargin: 8,
	} as const;
	const valueAxis = {
		tickLine: false,
		axisLine: false,
		tickFormatter: formatTick,
	} as const;
	if (kind === "hbar")
		return (
			<ChartContainer
				config={config}
				role="group"
				aria-label={title}
				className="aspect-auto w-full"
				style={{ height: Math.max(160, points.length * 34 + 24) }}
			>
				<BarChart
					accessibilityLayer
					data={points}
					layout="vertical"
					margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
				>
					<CartesianGrid horizontal={false} />
					<XAxis type="number" {...valueAxis} />
					<YAxis type="category" width={96} interval={0} {...categoryAxis} />
					{tooltip}
					<Bar
						dataKey="value"
						fill="var(--color-value)"
						radius={[0, 4, 4, 0]}
						isAnimationActive={false}
					/>
				</BarChart>
			</ChartContainer>
		);
	return (
		<ChartContainer
			config={config}
			role="group"
			aria-label={title}
			className="aspect-auto h-60 w-full"
		>
			{kind === "line" ? (
				<LineChart
					accessibilityLayer
					data={points}
					margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
				>
					<CartesianGrid vertical={false} />
					<XAxis minTickGap={24} {...categoryAxis} />
					<YAxis width={52} {...valueAxis} />
					{tooltip}
					<Line
						dataKey="value"
						type="linear"
						stroke="var(--color-value)"
						strokeWidth={2}
						dot={points.length <= 31 ? { r: 2.5 } : false}
						isAnimationActive={false}
					/>
				</LineChart>
			) : (
				<BarChart
					accessibilityLayer
					data={points}
					margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
				>
					<CartesianGrid vertical={false} />
					<XAxis minTickGap={8} {...categoryAxis} />
					<YAxis width={52} {...valueAxis} />
					{tooltip}
					<Bar
						dataKey="value"
						fill="var(--color-value)"
						radius={[4, 4, 0, 0]}
						isAnimationActive={false}
					/>
				</BarChart>
			)}
		</ChartContainer>
	);
}
