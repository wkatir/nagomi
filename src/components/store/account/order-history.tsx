import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StoreButton } from "#/components/store/ui/store-button";
import { FieldError } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { useMoney } from "#/hooks/use-money";
import { useStoreDate } from "#/hooks/use-store-date";
import { api, parseResponse } from "#/lib/api";
import type { OrderStatus } from "#/lib/enums";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";

const statusLabel: Record<OrderStatus, () => string> = {
	pending: m.account_order_status_pending,
	confirmed: m.account_order_status_confirmed,
	fulfilled: m.account_order_status_fulfilled,
	delivered: m.account_order_status_delivered,
	cancelled: m.account_order_status_cancelled,
};

export function OrderHistory() {
	const money = useMoney();
	const formatDate = useStoreDate();
	const [open, setOpen] = useState<string | null>(null);
	const orders = useQuery({
		queryKey: ["account", "orders"],
		queryFn: () => parseResponse(api().account.orders.$get()),
	});
	return (
		<section aria-labelledby="orders-title" className="max-w-3xl">
			<h2 id="orders-title" className="type-h3">
				{m.account_orders()}
			</h2>
			{orders.isPending ? (
				<Spinner aria-label={m.loading()} className="mt-4" />
			) : orders.isError ? (
				<FieldError className="mt-4">{errorMessage(orders.error)}</FieldError>
			) : orders.data.length === 0 ? (
				<p className="mt-4 text-muted-foreground">{m.account_no_orders()}</p>
			) : (
				<ul className="mt-5 grid gap-3">
					{orders.data.map((order) => (
						<li key={order.code} className="border p-5 type-small">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<p className="font-medium">{order.code}</p>
									<p className="text-muted-foreground">
										{formatDate(order.createdAt)} ·{" "}
										{m.account_order_items({ count: order.items })} ·{" "}
										{money(order.total)}
									</p>
								</div>
								<div className="flex items-center gap-3">
									<span className="font-medium">
										{statusLabel[order.status]()}
									</span>
									<StoreButton
										variant="outline"
										aria-expanded={open === order.code}
										onClick={() =>
											setOpen(open === order.code ? null : order.code)
										}
									>
										{open === order.code
											? m.account_order_hide()
											: m.account_order_show()}
									</StoreButton>
								</div>
							</div>
							{open === order.code && <OrderDetail code={order.code} />}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

function OrderDetail({ code }: { code: string }) {
	const money = useMoney();
	const formatDate = useStoreDate();
	const order = useQuery({
		queryKey: ["account", "orders", code],
		queryFn: () =>
			parseResponse(api().account.orders[":code"].$get({ param: { code } })),
	});
	if (order.isPending)
		return <Spinner aria-label={m.loading()} className="mt-4" />;
	if (order.isError)
		return (
			<FieldError className="mt-4">{errorMessage(order.error)}</FieldError>
		);
	return (
		<div className="mt-4 grid gap-4 border-t pt-4">
			<ul className="grid gap-1">
				{order.data.lines.map((line) => (
					<li key={line.sku} className="flex justify-between gap-4">
						<span>
							{line.quantity} × {line.brandName} {line.productName}
							{line.optionLabel && ` · ${line.optionLabel}`}
						</span>
						<span className="tabular-nums">
							{money(line.unitPrice * line.quantity)}
						</span>
					</li>
				))}
			</ul>
			<div>
				<p className="font-medium">{m.account_order_history()}</p>
				<ol className="mt-1 grid gap-1 text-muted-foreground">
					{order.data.statusHistory.map((step) => (
						<li key={`${step.to}-${step.at}`}>
							{formatDate(step.at)} · {statusLabel[step.to]()}
						</li>
					))}
				</ol>
			</div>
		</div>
	);
}
