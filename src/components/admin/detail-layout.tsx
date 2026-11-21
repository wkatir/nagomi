import { cn } from "cn";
import type { ReactNode } from "react";

export function DetailPage({ children }: { children: ReactNode }) {
	return <div className="mx-auto w-full max-w-6xl">{children}</div>;
}

export function DetailColumns({
	aside,
	wideAside = false,
	children,
}: {
	aside: ReactNode;
	wideAside?: boolean;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"grid items-start gap-admin-stack",
				wideAside
					? "lg:grid-cols-[minmax(0,1fr)_22rem]"
					: "lg:grid-cols-[minmax(0,1fr)_20rem]",
			)}
		>
			<div className="grid min-w-0 gap-admin-stack">{children}</div>
			<div className="grid min-w-0 gap-admin-stack">{aside}</div>
		</div>
	);
}
