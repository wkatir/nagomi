import { queryOptions, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { orderStatusLabel } from "#/components/admin/labels";
import { QueryError } from "#/components/admin/query-error";
import { Section } from "#/components/admin/section";
import { Badge } from "#/components/ui/badge";
import { Skeleton } from "#/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { useStoreDate } from "#/hooks/use-store-date";
import { api, parseResponse } from "#/lib/api";
import { m } from "#/paraglide/messages";

export const followupsQuery = queryOptions({
	queryKey: ["admin", "orders", "followups"],
	queryFn: () => parseResponse(api().admin.followups.$get()),
});

const hours = (value: number) =>
	value >= 48
		? m.admin_followup_days({ count: Math.floor(value / 24) })
		: m.admin_followup_hours({ count: Math.floor(value) });

export function Followups() {
	const query = useQuery(followupsQuery);
	const formatDate = useStoreDate();
	return (
		<Section
			title={m.admin_followup_title()}
			description={m.admin_followup_help()}
		>
			{query.isPending ? (
				<div className="p-admin-card">
					<Skeleton className="h-24" />
				</div>
			) : query.isError ? (
				<div className="p-admin-card">
					<QueryError error={query.error} onRetry={() => query.refetch()} />
				</div>
			) : query.data.orders.length === 0 ? (
				<p className="type-small p-admin-card text-muted-foreground">
					{m.admin_followup_empty()}
				</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{m.admin_col_order()}</TableHead>
							<TableHead>{m.admin_col_customer()}</TableHead>
							<TableHead>{m.admin_col_status()}</TableHead>
							<TableHead className="max-md:hidden">
								{m.admin_followup_due()}
							</TableHead>
							<TableHead className="text-right">
								{m.admin_followup_overdue()}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{query.data.orders.map((order) => (
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
										<span>
											{order.customerName ?? m.admin_customer_no_name()}
										</span>
										<span className="type-meta text-muted-foreground">
											{[order.customerPhone, order.customerEmail]
												.filter(Boolean)
												.join(" · ")}
										</span>
									</div>
								</TableCell>
								<TableCell>
									<Badge variant="secondary">
										{orderStatusLabel[order.status]()}
									</Badge>
								</TableCell>
								<TableCell className="max-md:hidden">
									{formatDate(order.dueAt, {
										dateStyle: "medium",
										timeStyle: "short",
									})}
								</TableCell>
								<TableCell className="text-right font-bold tabular-nums text-destructive">
									{hours(order.hoursOverdue)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</Section>
	);
}
