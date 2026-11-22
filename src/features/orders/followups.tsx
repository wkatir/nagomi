import { queryOptions, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { InferResponseType } from "hono/client";
import { useState } from "react";
import { StatusTabs } from "#/components/admin/data-table/status-tabs";
import { followupActionLabel } from "#/components/admin/labels";
import { QueryError } from "#/components/admin/query-error";
import { Section } from "#/components/admin/section";
import { OrderStatusBadge } from "#/components/admin/tone-badge";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { useMoney } from "#/hooks/use-money";
import { useStoreDate } from "#/hooks/use-store-date";
import { api, parseResponse } from "#/lib/api";
import { m } from "#/paraglide/messages";
import { useExpirePending } from "./mutations";

export const followupsQuery = queryOptions({
	queryKey: ["admin", "orders", "followups"],
	queryFn: () => parseResponse(api().admin.followups.$get()),
});

type Followup = InferResponseType<
	ReturnType<typeof api>["admin"]["followups"]["$get"],
	200
>["orders"][number];
export type FollowupAction = Followup["action"];
export type FollowupCounts = Record<FollowupAction, number>;

export const FOLLOWUP_ACTIONS = [
	"collect_payment",
	"ship",
	"confirm_delivery",
] as const satisfies readonly FollowupAction[];

export const followupCounts = (orders: Followup[]): FollowupCounts => ({
	collect_payment: orders.filter((o) => o.action === "collect_payment").length,
	ship: orders.filter((o) => o.action === "ship").length,
	confirm_delivery: orders.filter((o) => o.action === "confirm_delivery")
		.length,
});

const hours = (value: number) =>
	value >= 48
		? m.admin_followup_days({ count: Math.floor(value / 24) })
		: m.admin_followup_hours({ count: Math.floor(value) });

export function FollowupTable({
	orders,
	compact = false,
}: {
	orders: Followup[];
	compact?: boolean;
}) {
	const formatDate = useStoreDate();
	const money = useMoney();
	if (orders.length === 0)
		return (
			<p className="type-small p-admin-card text-muted-foreground">
				{m.admin_followup_empty()}
			</p>
		);
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>{m.admin_col_order()}</TableHead>
					<TableHead>{m.admin_col_customer()}</TableHead>
					<TableHead>{m.admin_followup_action()}</TableHead>
					{!compact && (
						<TableHead className="text-right max-md:hidden">
							{m.admin_col_total()}
						</TableHead>
					)}
					{!compact && (
						<TableHead className="max-md:hidden">
							{m.admin_followup_due()}
						</TableHead>
					)}
					<TableHead className="text-right">
						{m.admin_followup_overdue()}
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{orders.map((order) => (
					<TableRow key={order.orderId}>
						<TableCell>
							<Link
								to="/admin/orders/$id"
								params={{ id: order.orderId }}
								className="font-bold underline-offset-4 hover:underline"
							>
								{order.code}
							</Link>
						</TableCell>
						<TableCell className="whitespace-normal">
							<div className="grid">
								<span>{order.customerName}</span>
								{!compact && (
									<span className="type-meta text-muted-foreground">
										{[order.customerPhone, order.customerEmail]
											.filter(Boolean)
											.join(" · ")}
									</span>
								)}
							</div>
						</TableCell>
						<TableCell>
							<div
								className={
									compact
										? "flex flex-wrap items-center gap-2"
										: "grid justify-items-start gap-1"
								}
							>
								<span className="type-small font-medium">
									{followupActionLabel[order.action]()}
								</span>
								<OrderStatusBadge status={order.status} />
							</div>
						</TableCell>
						{!compact && (
							<TableCell className="text-right tabular-nums max-md:hidden">
								{money(order.total)}
							</TableCell>
						)}
						{!compact && (
							<TableCell className="max-md:hidden">
								{formatDate(order.dueAt, {
									dateStyle: "medium",
									timeStyle: "short",
								})}
							</TableCell>
						)}
						<TableCell className="text-right font-bold tabular-nums text-destructive">
							{hours(order.hoursOverdue)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

export function FollowupCountsRow({ counts }: { counts: FollowupCounts }) {
	return (
		<ul className="grid grid-cols-3 divide-x border-b">
			{FOLLOWUP_ACTIONS.map((action) => (
				<li key={action} className="grid gap-0.5 px-admin-card py-3">
					<span className="type-meta text-muted-foreground">
						{followupActionLabel[action]()}
					</span>
					<span
						data-late={counts[action] > 0}
						className="type-title tabular-nums data-[late=true]:text-destructive"
					>
						{counts[action]}
					</span>
				</li>
			))}
		</ul>
	);
}

export function FollowupDigest({
	counts,
	orders,
}: {
	counts: FollowupCounts;
	orders: Followup[];
}) {
	const total = counts.collect_payment + counts.ship + counts.confirm_delivery;
	return (
		<Section
			title={m.admin_followup_title()}
			description={m.admin_followup_digest_note({ count: total })}
			action={
				<Button variant="ghost" size="sm" asChild>
					<Link to="/admin/orders/followups">{m.admin_overview_see_all()}</Link>
				</Button>
			}
		>
			<FollowupCountsRow counts={counts} />
			<FollowupTable orders={orders} compact />
		</Section>
	);
}

const DIGEST_ROWS = 3;

export function FollowupDigestLoader() {
	const query = useQuery(followupsQuery);
	if (query.isPending) return <Skeleton className="h-40 w-full" />;
	if (query.isError)
		return <QueryError error={query.error} onRetry={() => query.refetch()} />;
	return (
		<FollowupDigest
			counts={followupCounts(query.data.orders)}
			orders={query.data.orders.slice(0, DIGEST_ROWS)}
		/>
	);
}

export function Followups() {
	const query = useQuery(followupsQuery);
	const expire = useExpirePending();
	const [action, setAction] = useState<FollowupAction | undefined>();
	const orders = query.data?.orders ?? [];
	const counts = followupCounts(orders);
	const tabLabel = (a: FollowupAction) => () =>
		m.admin_followup_tab({
			action: followupActionLabel[a](),
			count: counts[a],
		});
	return (
		<Section
			title={m.admin_followup_title()}
			description={m.admin_followup_help()}
		>
			<div className="grid gap-2 border-b p-admin-card">
				<p className="type-small text-muted-foreground">
					{m.admin_order_expire_pending_body()}
				</p>
				<div className="flex flex-wrap items-center gap-3">
					<Button
						size="sm"
						variant="outline"
						disabled={expire.isPending || counts.collect_payment === 0}
						onClick={() => expire.mutate()}
					>
						{m.admin_order_expire_pending()}
					</Button>
					{expire.isSuccess && (
						<span className="type-small">
							{m.admin_order_expire_pending_done({
								count: String(expire.data.cancelled.length),
							})}
						</span>
					)}
				</div>
			</div>
			<div className="px-admin-card pt-3">
				<StatusTabs
					values={FOLLOWUP_ACTIONS}
					label={{
						collect_payment: tabLabel("collect_payment"),
						ship: tabLabel("ship"),
						confirm_delivery: tabLabel("confirm_delivery"),
					}}
					allLabel={m.admin_followup_tab_all({ count: orders.length })}
					value={action}
					onChange={setAction}
				/>
			</div>
			{query.isPending ? (
				<div className="p-admin-card">
					<Skeleton className="h-24" />
				</div>
			) : query.isError ? (
				<div className="p-admin-card">
					<QueryError error={query.error} onRetry={() => query.refetch()} />
				</div>
			) : (
				<FollowupTable
					orders={action ? orders.filter((o) => o.action === action) : orders}
				/>
			)}
		</Section>
	);
}
