import { useSuspenseQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { FlaskConical } from "lucide-react";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export function DemoBar() {
	const { data: store } = useSuspenseQuery(storeQuery);
	if (!store.demoStore) return null;
	return (
		<p className="flex items-center justify-center gap-2 border-b bg-accent/40 px-4 py-1.5 text-center type-meta text-foreground-secondary">
			<FlaskConical aria-hidden className="size-3.5 shrink-0 text-brand" />
			{m.store_demo_notice()}
		</p>
	);
}

export function DemoNotice({
	message,
	className,
}: {
	message?: string;
	className?: string;
}) {
	const { data: store } = useSuspenseQuery(storeQuery);
	if (!store.demoStore) return null;
	return (
		<p
			role="note"
			className={cn(
				"flex items-start gap-2 rounded-lg border border-brand/40 bg-accent/40 px-3 py-2 type-small",
				className,
			)}
		>
			<FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
			{message ?? m.store_demo_notice()}
		</p>
	);
}
