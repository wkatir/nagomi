import type { UseQueryResult } from "@tanstack/react-query";
import { cn } from "cn";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Spinner } from "#/components/ui/spinner";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";

export function PageHeader({
	title,
	badges,
	description,
	action,
}: {
	title: string;
	badges?: ReactNode;
	description?: ReactNode;
	action?: ReactNode;
}) {
	return (
		<header
			className={cn(
				"mb-admin-section flex flex-wrap justify-between gap-x-4 gap-y-3",
				description ? "items-start" : "items-center",
			)}
		>
			<div className="grid min-w-0 gap-1">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
					<h1 className="type-h3 min-w-0 break-words">{title}</h1>
					{badges}
				</div>
				{description && (
					<p className="type-small text-muted-foreground">{description}</p>
				)}
			</div>
			{action}
		</header>
	);
}

export function HeaderActions({ children }: { children: ReactNode }) {
	return (
		<div className="flex w-full items-center gap-2 sm:w-auto">{children}</div>
	);
}

export function QueryState<T>({
	query,
	children,
}: {
	query: UseQueryResult<T>;
	children: (data: T) => ReactNode;
}) {
	if (query.isPending)
		return (
			<Spinner aria-label={m.loading()} className="text-muted-foreground" />
		);
	if (query.isError)
		return (
			<Alert variant="destructive">
				<AlertDescription>{errorMessage(query.error)}</AlertDescription>
			</Alert>
		);
	return <>{children(query.data)}</>;
}
