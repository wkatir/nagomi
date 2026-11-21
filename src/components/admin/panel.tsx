import { cn } from "cn";
import type * as React from "react";
import { Card } from "#/components/ui/card";

// The generated Card pads and spaces its children and casts a shadow; here the children bring
// their own padding and the block is flat.
export function Panel({
	className,
	...props
}: React.ComponentProps<typeof Card>) {
	return (
		<Card className={cn("gap-0 py-0 shadow-none", className)} {...props} />
	);
}
