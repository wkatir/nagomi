import { useQuery } from "@tanstack/react-query";
import { QueryError } from "#/components/admin/query-error";
import { Section } from "#/components/admin/section";
import { Skeleton } from "#/components/ui/skeleton";
import { useMoney } from "#/hooks/use-money";
import { useStoreDate } from "#/hooks/use-store-date";
import type { AdminProduct } from "#/lib/api";
import { m } from "#/paraglide/messages";
import { priceHistoryQuery } from "./queries";

export function PriceHistoryCard({ product }: { product: AdminProduct }) {
	const history = useQuery(priceHistoryQuery(product.id));
	const money = useMoney();
	const formatDate = useStoreDate();
	const price = (amount: number | null) =>
		amount === null ? m.admin_no_price() : money(amount);
	return (
		<Section title={m.admin_product_price_history()}>
			{history.isPending ? (
				<div className="p-admin-card">
					<Skeleton className="h-16" />
				</div>
			) : history.isError ? (
				<div className="p-admin-card">
					<QueryError error={history.error} onRetry={() => history.refetch()} />
				</div>
			) : history.data.length === 0 ? (
				<p className="type-small p-admin-card text-muted-foreground">
					{m.admin_product_price_history_empty()}
				</p>
			) : (
				<ul>
					{history.data.map((row) => (
						<li
							key={row.id}
							className="type-small grid grid-cols-[1fr_auto] gap-x-4 border-b p-admin-card last:border-b-0"
						>
							<span>
								<span className="font-bold">{row.sku}</span>{" "}
								<span className="tabular-nums">
									{m.admin_product_price_change({
										from: price(row.oldPrice),
										to: price(row.newPrice),
									})}
								</span>
							</span>
							<span className="type-meta text-right text-muted-foreground">
								{formatDate(row.changedAt, {
									dateStyle: "medium",
									timeStyle: "short",
								})}
								{" · "}
								{row.changedByName ?? m.admin_product_price_history_system()}
							</span>
						</li>
					))}
				</ul>
			)}
		</Section>
	);
}
