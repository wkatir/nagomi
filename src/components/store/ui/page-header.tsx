import { cn } from "cn";
import type { LucideIcon } from "lucide-react";

export function PageHeader({
	title,
	subtitle,
	description,
	icon: Icon,
	className,
}: {
	title: string;
	subtitle?: string | null;
	description?: string | null;
	icon?: LucideIcon;
	className?: string;
}) {
	return (
		<header
			className={cn(
				"panel relative flex items-start gap-4 overflow-hidden p-5 md:p-6",
				className,
			)}
		>
			<div
				aria-hidden
				className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(ellipse_at_right,rgb(139_124_246/0.18),transparent_70%)]"
			/>
			{Icon && (
				<span className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-brand">
					<Icon aria-hidden className="size-6" />
				</span>
			)}
			<div className="relative min-w-0">
				<h1 className="type-h1 text-balance">{title}</h1>
				{subtitle && (
					<p className="mt-1 type-small text-[#b4a8ff]">{subtitle}</p>
				)}
				{description && (
					<p className="mt-2 max-w-[70ch] type-small text-foreground-secondary">
						{description}
					</p>
				)}
			</div>
		</header>
	);
}
