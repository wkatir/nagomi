import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "#/components/ui/chart";

// `key` tells the points apart: two days can read "10 oct" across years.
export type ChartPoint = { key: string; label: string; value: number };

export default function SeriesChart({
	title,
	points,
	seriesLabel,
	formatValue,
	formatTick,
}: {
	title: string;
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
	return (
		<ChartContainer
			config={config}
			role="group"
			aria-label={title}
			className="aspect-auto h-60 w-full"
		>
			<BarChart
				accessibilityLayer
				data={points}
				margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
			>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="key"
					tickFormatter={labelOf}
					tickLine={false}
					axisLine={false}
					tickMargin={8}
					minTickGap={24}
				/>
				<YAxis
					tickLine={false}
					axisLine={false}
					width={52}
					tickFormatter={formatTick}
				/>
				<ChartTooltip
					cursor={false}
					content={
						<ChartTooltipContent
							hideIndicator
							labelFormatter={labelOf}
							formatter={(value) => {
								if (typeof value !== "number")
									throw new Error(
										`Chart value ${String(value)} is not a number`,
									);
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
				<Bar
					dataKey="value"
					fill="var(--color-value)"
					radius={[4, 4, 0, 0]}
					isAnimationActive={false}
				/>
			</BarChart>
		</ChartContainer>
	);
}
