import { cn } from "cn";
import type { LucideIcon } from "lucide-react";

type TrustItem = {
	icon: LucideIcon;
	title: string;
};

export function TrustList({
	items,
	className,
}: {
	items: readonly TrustItem[];
	className?: string;
}) {
	return (
		<ul
			className={cn(
				"grid grid-cols-1 border-t sm:grid-cols-2 lg:grid-cols-3",
				className,
			)}
		>
			{items.map(({ icon: Icon, title }) => (
				<li
					key={title}
					className="flex gap-4 border-b py-6 sm:pr-8 lg:border-b-0 lg:pt-8 lg:pb-0"
				>
					<Icon
						aria-hidden
						strokeWidth={1.5}
						className="mt-0.5 size-6 shrink-0"
					/>
					<p className="font-medium">{title}</p>
				</li>
			))}
		</ul>
	);
}
