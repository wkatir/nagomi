import { cn } from "cn";
import type { ComponentProps, ReactNode } from "react";
import { Panel } from "#/components/admin/panel";
import { Skeleton } from "#/components/ui/skeleton";

// When `label` holds a link, it is stretched over the whole card.
export function StatCard({
	label,
	value,
	note,
	tone,
}: {
	label: ReactNode;
	value: ReactNode;
	note?: ReactNode;
	tone?: "warning" | "destructive";
}) {
	return (
		<Panel className="relative gap-1 p-admin-card transition-colors has-[a]:hover:bg-muted/50 has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50">
			<p className="type-small text-muted-foreground [&_a]:outline-none [&_a]:after:absolute [&_a]:after:inset-0 [&_a]:hover:underline">
				{label}
			</p>
			<p
				className="type-stat break-words data-[tone=destructive]:text-destructive data-[tone=warning]:text-warning max-sm:text-[1.375rem]"
				data-tone={tone}
			>
				{value}
			</p>
			{note && <p className="type-meta text-muted-foreground">{note}</p>}
		</Panel>
	);
}

export function StatGrid({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"grid grid-cols-2 gap-admin-stack lg:grid-cols-4",
				className,
			)}
			{...props}
		/>
	);
}

const SKELETON_KEYS = Array.from({ length: 8 }, (_, n) => `stat-${n}`);

export function StatGridSkeleton({
	count,
	className,
}: {
	count: number;
	className?: string;
}) {
	return (
		<StatGrid aria-busy className={className}>
			{SKELETON_KEYS.slice(0, count).map((key) => (
				<Skeleton key={key} className="h-[5.5rem] w-full" />
			))}
		</StatGrid>
	);
}
