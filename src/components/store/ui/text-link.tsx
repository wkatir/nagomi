import { createLink } from "@tanstack/react-router";
import { cn } from "cn";
import type * as React from "react";

// `inline` (a link inside a sentence) drops the 44px tap target.
export function TextAnchor({
	inline,
	variant = "underline",
	className,
	...props
}: React.ComponentProps<"a"> & {
	inline?: boolean;
	variant?: "underline" | "nav";
}) {
	return (
		<a
			className={cn(
				"underline-offset-4",
				variant === "underline"
					? "underline decoration-1 hover:decoration-2"
					: "hover:underline",
				!inline && "inline-flex min-h-(--control-lg) items-center",
				className,
			)}
			{...props}
		/>
	);
}

// TextAnchor is for addresses outside the router (mailto, wa.me, the other locale).
export const TextLink = createLink(TextAnchor);
