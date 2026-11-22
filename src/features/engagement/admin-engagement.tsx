import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { reviewStatusLabel } from "#/components/admin/labels";
import { QueryError } from "#/components/admin/query-error";
import { Section } from "#/components/admin/section";
import { reviewStatusTone, ToneBadge } from "#/components/admin/tone-badge";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { useStoreDate } from "#/hooks/use-store-date";
import { api, parseResponse } from "#/lib/api";
import type { ReviewStatus } from "#/lib/enums";
import { REVIEW_STATUSES } from "#/lib/enums";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";

export const reviewsQuery = (status: ReviewStatus | undefined) =>
	queryOptions({
		queryKey: ["admin", "reviews", status ?? "all"],
		queryFn: () =>
			parseResponse(
				api().admin.reviews.$get({ query: status ? { status } : {} }),
			),
	});

export function ReviewsModeration() {
	const [status, setStatus] = useState<ReviewStatus | undefined>("pending");
	const query = useQuery(reviewsQuery(status));
	const queryClient = useQueryClient();
	const formatDate = useStoreDate();
	const decide = useMutation({
		mutationFn: (input: { id: number; decision: "approve" | "reject" }) =>
			parseResponse(
				api().admin.reviews[":id"][":decision"].$post({
					param: { id: String(input.id), decision: input.decision },
				}),
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] }),
		onError: (e) => toast.error(errorMessage(e)),
	});
	return (
		<Section
			title={m.admin_reviews_title()}
			description={m.admin_reviews_body()}
		>
			<div className="flex flex-wrap gap-2 border-b p-admin-card">
				{REVIEW_STATUSES.map((s) => (
					<Button
						key={s}
						size="sm"
						variant={status === s ? "default" : "outline"}
						onClick={() => setStatus(s)}
					>
						{reviewStatusLabel[s]()}
						{query.data && ` (${query.data.counts[s]})`}
					</Button>
				))}
				<Button
					size="sm"
					variant={status === undefined ? "default" : "outline"}
					onClick={() => setStatus(undefined)}
				>
					{m.admin_orders_all()}
				</Button>
			</div>
			{query.isPending ? (
				<div className="p-admin-card">
					<Skeleton className="h-24" />
				</div>
			) : query.isError ? (
				<div className="p-admin-card">
					<QueryError error={query.error} onRetry={() => query.refetch()} />
				</div>
			) : query.data.reviews.length === 0 ? (
				<p className="type-small p-admin-card text-muted-foreground">
					{m.admin_reviews_empty()}
				</p>
			) : (
				<ul className="divide-y">
					{query.data.reviews.map((r) => (
						<li key={r.id} className="grid gap-1 p-admin-card">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<span className="font-medium">
									{r.productName ?? r.productSlug} · {"★".repeat(r.rating)}
								</span>
								<ToneBadge tone={reviewStatusTone[r.status]}>
									{reviewStatusLabel[r.status]()}
								</ToneBadge>
							</div>
							<p className="font-medium">{r.title}</p>
							<p className="type-small">{r.body}</p>
							<p className="type-meta text-muted-foreground">
								{r.customerName} · {r.customerEmail} ·{" "}
								{formatDate(r.updatedAt, { dateStyle: "medium" })}
							</p>
							<div className="flex gap-2">
								{r.status !== "approved" && (
									<Button
										size="sm"
										disabled={decide.isPending}
										onClick={() =>
											decide.mutate({ id: r.id, decision: "approve" })
										}
									>
										{m.admin_review_approve()}
									</Button>
								)}
								{r.status !== "rejected" && (
									<Button
										size="sm"
										variant="outline"
										disabled={decide.isPending}
										onClick={() =>
											decide.mutate({ id: r.id, decision: "reject" })
										}
									>
										{m.admin_review_reject()}
									</Button>
								)}
							</div>
						</li>
					))}
				</ul>
			)}
		</Section>
	);
}

export const stockAlertsQuery = queryOptions({
	queryKey: ["admin", "stock-alerts"],
	queryFn: () => parseResponse(api().admin["stock-alerts"].$get()),
});

export function StockAlerts() {
	const query = useQuery(stockAlertsQuery);
	const queryClient = useQueryClient();
	const formatDate = useStoreDate();
	const notified = useMutation({
		mutationFn: (id: number) =>
			parseResponse(
				api().admin["stock-alerts"][":id"].notified.$post({
					param: { id: String(id) },
				}),
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: stockAlertsQuery.queryKey }),
		onError: (e) => toast.error(errorMessage(e)),
	});
	return (
		<Section
			title={m.admin_stock_alerts_title()}
			description={m.admin_stock_alerts_body()}
		>
			{query.isPending ? (
				<div className="p-admin-card">
					<Skeleton className="h-24" />
				</div>
			) : query.isError ? (
				<div className="p-admin-card">
					<QueryError error={query.error} onRetry={() => query.refetch()} />
				</div>
			) : query.data.products.length === 0 ? (
				<p className="type-small p-admin-card text-muted-foreground">
					{m.admin_stock_alerts_empty()}
				</p>
			) : (
				<ul className="divide-y">
					{query.data.products.map((p) => (
						<li key={p.variantId} className="grid gap-2 p-admin-card">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<span className="font-medium">
									{p.productName ?? p.productSlug} · {p.sku}
								</span>
								<span className="flex items-center gap-2">
									<Badge variant={p.unitsOnHand > 0 ? "default" : "outline"}>
										{m.admin_stock_alerts_units({
											count: String(p.unitsOnHand),
										})}
									</Badge>
									<Button
										size="sm"
										variant="outline"
										onClick={async () => {
											try {
												await navigator.clipboard.writeText(
													p.alerts.map((a) => a.email).join(", "),
												);
												toast.success(m.admin_stock_alerts_copy());
											} catch {
												toast.error(m.error_generic());
											}
										}}
									>
										{m.admin_stock_alerts_copy()}
									</Button>
								</span>
							</div>
							<ul className="grid gap-1">
								{p.alerts.map((a) => (
									<li
										key={a.id}
										className="flex flex-wrap items-center justify-between gap-2 type-small"
									>
										<span>
											{a.email}{" "}
											<span className="text-muted-foreground">
												· {formatDate(a.createdAt, { dateStyle: "medium" })}
											</span>
										</span>
										<Button
											size="sm"
											variant="ghost"
											disabled={notified.isPending}
											onClick={() => notified.mutate(a.id)}
										>
											{m.admin_stock_alerts_notified()}
										</Button>
									</li>
								))}
							</ul>
						</li>
					))}
				</ul>
			)}
		</Section>
	);
}
