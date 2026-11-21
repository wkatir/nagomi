import type { UseQueryResult } from "@tanstack/react-query";
import { cn } from "cn";
import { DownloadIcon } from "lucide-react";
import type { ReactNode } from "react";
import { QueryError } from "#/components/admin/query-error";
import { StatGridSkeleton } from "#/components/admin/stat-card";
import { Button } from "#/components/ui/button";
import {
	NativeSelect,
	NativeSelectOption,
} from "#/components/ui/native-select";
import { Skeleton } from "#/components/ui/skeleton";
import { m } from "#/paraglide/messages";

function ReportSkeleton() {
	return (
		<div aria-busy className="grid gap-admin-stack">
			<StatGridSkeleton count={4} />
			<Skeleton className="h-80 w-full" />
			<Skeleton className="h-64 w-full" />
		</div>
	);
}

export function ReportState<T>({
	query,
	children,
}: {
	query: UseQueryResult<T>;
	children: (report: T) => ReactNode;
}) {
	if (query.isPending) return <ReportSkeleton />;
	if (query.isError)
		return <QueryError error={query.error} onRetry={() => query.refetch()} />;
	return (
		<div
			aria-busy={query.isFetching}
			className={cn(
				"grid gap-admin-stack transition-opacity",
				query.isPlaceholderData && "opacity-60",
			)}
		>
			{children(query.data)}
		</div>
	);
}

export function ReportToolbar({
	csv,
	children,
}: {
	csv: string;
	children?: ReactNode;
}) {
	return (
		<div className="mb-4 flex flex-wrap items-center gap-2">
			{children}
			<Button variant="outline" size="sm" className="ml-auto" asChild>
				<a href={csv} download>
					<DownloadIcon aria-hidden />
					{m.admin_export_csv()}
				</a>
			</Button>
		</div>
	);
}

export function ReportSelect<T extends string | number>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: readonly { value: T; label: string }[];
	onChange: (value: T) => void;
}) {
	return (
		<NativeSelect
			size="sm"
			aria-label={label}
			value={String(value)}
			onChange={(event) => {
				const chosen = options.find(
					(option) => String(option.value) === event.target.value,
				);
				if (!chosen) throw new Error(`Unknown option ${event.target.value}`);
				onChange(chosen.value);
			}}
		>
			{options.map((option) => (
				<NativeSelectOption key={option.value} value={String(option.value)}>
					{option.label}
				</NativeSelectOption>
			))}
		</NativeSelect>
	);
}
