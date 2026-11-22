import { Cell, Pie, PieChart } from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "#/components/ui/chart";
import { SHARE_COLORS } from "./chart-format";
import type { ChartPoint } from "./series-chart";

export default function ShareChart({
	title,
	parts,
	formatValue,
}: {
	title: string;
	parts: ChartPoint[];
	formatValue: (value: number) => string;
}) {
	const config: ChartConfig = Object.fromEntries(
		parts.map((part, n) => [
			part.key,
			{ label: part.label, color: SHARE_COLORS[n] },
		]),
	);
	return (
		<ChartContainer
			config={config}
			role="group"
			aria-label={title}
			className="aspect-square h-52 w-full"
		>
			<PieChart accessibilityLayer>
				<ChartTooltip
					content={
						<ChartTooltipContent
							nameKey="key"
							formatter={(value, _name, item) => {
								if (typeof value !== "number")
									throw new Error(
										`Chart value ${String(value)} is not a number`,
									);
								return (
									<div className="flex w-full items-center justify-between gap-4">
										<span className="text-muted-foreground">
											{item.payload.label}
										</span>
										<span className="font-medium tabular-nums">
											{formatValue(value)}
										</span>
									</div>
								);
							}}
						/>
					}
				/>
				<Pie
					data={parts}
					dataKey="value"
					nameKey="key"
					innerRadius="55%"
					outerRadius="90%"
					strokeWidth={2}
					stroke="var(--card)"
					isAnimationActive={false}
				>
					{parts.map((part, n) => (
						<Cell key={part.key} fill={SHARE_COLORS[n]} />
					))}
				</Pie>
			</PieChart>
		</ChartContainer>
	);
}
