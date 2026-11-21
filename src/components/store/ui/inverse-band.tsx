import { cn } from "cn";
import type * as React from "react";

// surface-inverse flips the tokens, so buttons, links, hairlines, muted text and focus rings
// inside it need no extra classes.
export function InverseBand({
	className,
	children,
	...props
}: React.ComponentProps<"section">) {
	return (
		<section className={cn("surface-inverse py-section", className)} {...props}>
			<div className="container-page">{children}</div>
		</section>
	);
}
