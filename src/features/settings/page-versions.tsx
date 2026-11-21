import { useInfiniteQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { useStoreDate } from "#/hooks/use-store-date";
import type { Locale } from "#/lib/enums";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";
import { type PageVersion, pageVersionsQuery } from "./queries";

// Taking a version back only refills the form: the old version stays as it was, since
// consents point at it.
export function PageVersions({
	pageId,
	locale,
	currentVersion,
	onUse,
}: {
	pageId: number;
	locale: Locale;
	currentVersion: number;
	onUse: (version: PageVersion) => void;
}) {
	const versions = useInfiniteQuery(pageVersionsQuery(pageId, locale));
	const formatDate = useStoreDate();
	if (versions.isPending)
		return (
			<div aria-busy className="grid gap-2">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
			</div>
		);
	if (versions.isError)
		return (
			<Alert variant="destructive">
				<AlertDescription className="flex flex-wrap items-center justify-between gap-3">
					{errorMessage(versions.error)}
					<Button
						variant="outline"
						size="sm"
						onClick={() => versions.refetch()}
					>
						{m.admin_table_retry()}
					</Button>
				</AlertDescription>
			</Alert>
		);
	return (
		<div className="grid gap-3">
			<ul className="divide-y rounded-md border">
				{versions.data.pages
					.flatMap((page) => page.items)
					.map((version) => {
						const saved = formatDate(version.createdAt, {
							dateStyle: "medium",
							timeStyle: "short",
						});
						return (
							<li
								key={version.id}
								className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3"
							>
								<div className="grid min-w-0 gap-0.5">
									<span className="type-small flex flex-wrap items-center gap-2 font-bold">
										{m.admin_settings_version_n({ version: version.version })}
										{version.version === currentVersion && (
											<Badge variant="secondary">
												{m.admin_settings_version_current()}
											</Badge>
										)}
									</span>
									<span className="type-meta text-muted-foreground">
										{version.author
											? m.admin_settings_version_by({
													date: saved,
													author: version.author,
												})
											: saved}
									</span>
								</div>
								{version.version !== currentVersion && (
									<Button
										variant="outline"
										size="sm"
										onClick={() => onUse(version)}
									>
										{m.admin_settings_version_use()}
									</Button>
								)}
							</li>
						);
					})}
			</ul>
			{versions.hasNextPage && (
				<Button
					variant="outline"
					size="sm"
					className="mx-auto"
					disabled={versions.isFetchingNextPage}
					onClick={() => versions.fetchNextPage()}
				>
					{versions.isFetchingNextPage && <Spinner aria-hidden />}
					{m.admin_media_more()}
				</Button>
			)}
		</div>
	);
}
