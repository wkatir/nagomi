import { cn } from "cn";
import type * as React from "react";
import { promiseIcon } from "../promise-icon";

// The caller sets the layout (a grid) and may add its own lines as children.
export function PromiseList({
	items,
	className,
	children,
}: {
	items: readonly { slug: string; title: string }[];
	className?: string;
	children?: React.ReactNode;
}) {
	return (
		<ul className={cn("type-small", className)}>
			{items.map((promise) => {
				const Icon = promiseIcon(promise.slug);
				return (
					<li key={promise.slug} className="flex items-start gap-2.5">
						<Icon aria-hidden className="size-5 shrink-0" />
						{promise.title}
					</li>
				);
			})}
			{children}
		</ul>
	);
}
