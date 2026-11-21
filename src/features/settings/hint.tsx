import type { ReactNode } from "react";

export const Hint = ({ children }: { children: ReactNode }) => (
	<p className="type-meta text-muted-foreground">{children}</p>
);
