import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { useState } from "react";
import { DateRangeFilter } from "#/components/admin/data-table/date-range-filter";
import { SelectFilter } from "#/components/admin/data-table/select-filter";
import { Panel } from "#/components/admin/panel";
import { QueryError } from "#/components/admin/query-error";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { useStoreDate } from "#/hooks/use-store-date";
import { AUDIT_VERBS, type AuditListSearch } from "#/lib/schemas/audit";
import { m } from "#/paraglide/messages";
import { AuditEventDialog, actorName, eventTitle } from "./audit-event-dialog";
import { auditVerbLabel, entityOptions, verbText } from "./labels";
import { type AuditEvent, auditActorsQuery, auditFeedQuery } from "./queries";
import { clearedFilters, isFiltered } from "./search";

const SKELETON_ROWS = Array.from({ length: 6 }, (_, n) => `skeleton-${n}`);

export function AuditFeed({
	search,
	onSearchChange,
}: {
	search: AuditListSearch;
	onSearchChange: (change: Partial<AuditListSearch>) => void;
}) {
	const feed = useInfiniteQuery(auditFeedQuery(search));
	const actors = useQuery(auditActorsQuery);
	const formatDate = useStoreDate();
	const [open, setOpen] = useState<AuditEvent | null>(null);
	const filtered = isFiltered(search);
	const events = feed.data?.pages.flatMap((page) => page.items);

	return (
		<>
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<SelectFilter
					label={m.admin_audit_filter_entity()}
					allLabel={m.admin_audit_filter_entity_all()}
					value={search.entityType}
					options={entityOptions()}
					onChange={(entityType) => onSearchChange({ entityType })}
				/>
				<SelectFilter
					label={m.admin_audit_filter_verb()}
					allLabel={m.admin_audit_filter_verb_all()}
					value={search.verb}
					options={AUDIT_VERBS.map((value) => ({
						value,
						label: auditVerbLabel[value](),
					}))}
					onChange={(verb) => onSearchChange({ verb })}
				/>
				{actors.data && (
					<SelectFilter
						label={m.admin_audit_filter_actor()}
						allLabel={m.admin_audit_filter_actor_all()}
						value={search.actor}
						options={actors.data.map((actor) => ({
							value: actor.id,
							label: actor.name,
						}))}
						onChange={(actor) => onSearchChange({ actor })}
					/>
				)}
				<DateRangeFilter
					value={{ from: search.from, to: search.to }}
					onChange={({ from, to }) => onSearchChange({ from, to })}
				/>
				{filtered && (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => onSearchChange(clearedFilters)}
					>
						<XIcon aria-hidden />
						{m.admin_table_clear_filters()}
					</Button>
				)}
			</div>
			{actors.isError && (
				<div className="mb-4">
					<QueryError error={actors.error} onRetry={() => actors.refetch()} />
				</div>
			)}
			<Panel aria-busy={feed.isFetching}>
				{feed.isPending && (
					<ul>
						{SKELETON_ROWS.map((key) => (
							<li key={key} className="grid gap-2 border-b px-admin-card py-3">
								<Skeleton className="h-5 w-48" />
								<Skeleton className="h-4 w-32" />
							</li>
						))}
					</ul>
				)}
				{feed.isError && (
					<div className="p-admin-card">
						<QueryError error={feed.error} onRetry={() => feed.refetch()} />
					</div>
				)}
				{events?.length === 0 && (
					<Empty>
						<EmptyHeader>
							<EmptyTitle>
								{filtered ? m.admin_table_no_results() : m.admin_audit_empty()}
							</EmptyTitle>
							<EmptyDescription>
								{filtered
									? m.admin_table_no_results_hint()
									: m.admin_audit_empty_hint()}
							</EmptyDescription>
						</EmptyHeader>
						{filtered && (
							<EmptyContent>
								<Button
									variant="outline"
									onClick={() => onSearchChange(clearedFilters)}
								>
									{m.admin_table_clear_filters()}
								</Button>
							</EmptyContent>
						)}
					</Empty>
				)}
				{events && events.length > 0 && (
					<ul>
						{events.map((event) => (
							<li key={event.id} className="border-b last:border-b-0">
								<Button
									variant="ghost"
									className="h-auto w-full justify-between gap-4 rounded-none px-admin-card py-3 text-left font-normal whitespace-normal"
									onClick={() => setOpen(event)}
								>
									<span className="grid min-w-0 gap-1">
										<span className="flex flex-wrap items-center gap-2">
											<span className="type-small font-bold">
												{eventTitle(event)}
											</span>
											<Badge variant="outline">{verbText(event.action)}</Badge>
										</span>
										<span className="type-meta text-muted-foreground">
											{m.admin_audit_by({ name: actorName(event) })}
										</span>
									</span>
									<span className="type-meta shrink-0 text-right text-muted-foreground">
										{formatDate(event.createdAt, {
											dateStyle: "medium",
											timeStyle: "short",
										})}
									</span>
								</Button>
							</li>
						))}
					</ul>
				)}
			</Panel>
			{events && events.length > 0 && (
				<div className="mt-4 flex justify-center">
					{feed.hasNextPage ? (
						<Button
							variant="outline"
							disabled={feed.isFetchingNextPage}
							onClick={() => feed.fetchNextPage()}
						>
							{feed.isFetchingNextPage && <Spinner aria-hidden />}
							{m.admin_audit_more()}
						</Button>
					) : (
						<p className="type-meta text-muted-foreground">
							{m.admin_audit_end()}
						</p>
					)}
				</div>
			)}
			{open && <AuditEventDialog event={open} onClose={() => setOpen(null)} />}
		</>
	);
}
