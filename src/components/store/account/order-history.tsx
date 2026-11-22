import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { ChevronDown, Package } from "lucide-react";
import { useState } from "react";
import { OrderStatusBadge, OrderTimeline } from "#/components/store/order-view";
import { StoreButton } from "#/components/store/ui/store-button";
import { FieldError } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { useMoney } from "#/hooks/use-money";
import { useStoreDate } from "#/hooks/use-store-date";
import { api, parseResponse } from "#/lib/api";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";

export function OrderHistory() {
	const money = useMoney();
	const formatDate = useStoreDate();
	const [open, setOpen] = useState<string | null>(null);
	const orders = useQuery({
		queryKey: ["account", "orders"],
		queryFn: () => parseResponse(api().account.orders.$get()),
	});
	return (
		<section
			id="orders"
			aria-labelledby="orders-title"
			className="scroll-mt-[calc(var(--header-height)+1rem)]"
		>
			<h2 id="orders-title" className="type-h2">
				{m.account_orders()}
			</h2>
			{orders.isPending ? (
				<Spinner aria-label={m.loading()} className="mt-4" />
			) : orders.isError ? (
				<FieldError className="mt-4">{errorMessage(orders.error)}</FieldError>
			) : orders.data.length === 0 ? (
				<div className="panel mt-3 flex flex-wrap items-center justify-between gap-3 p-5">
					<p className="flex items-center gap-3 type-small text-muted-foreground">
						<Package aria-hidden className="size-5" />
						{m.account_no_orders()}
					</p>
					<StoreButton asChild variant="outline" size="sm">
						<Link to="/products">{m.home_cta_shop()}</Link>
					</StoreButton>
				</div>
			) : (
				<ul className="mt-3 grid gap-3">
					{orders.data.map((order) => {
						const expanded = open === order.code;
						return (
							<li key={order.code} className="panel p-4 md:p-5">
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div className="min-w-0">
										<p className="flex flex-wrap items-center gap-2">
											<span className="type-small font-semibold tabular-nums">
												{order.code}
											</span>
											<OrderStatusBadge status={order.status} />
										</p>
										<p className="mt-1 type-meta text-muted-foreground">
											{formatDate(order.createdAt, { dateStyle: "medium" })} ·{" "}
											{m.account_order_items({ count: order.items })} ·{" "}
											<span className="tabular-nums">{money(order.total)}</span>
										</p>
									</div>
									<StoreButton
										variant="outline"
										size="sm"
										aria-expanded={expanded}
										aria-controls={`order-${order.code}`}
										onClick={() => setOpen(expanded ? null : order.code)}
										className="gap-1.5"
									>
										{expanded ? m.account_order_hide() : m.account_order_show()}
										<ChevronDown
											aria-hidden
											className={cn(
												"size-4 transition-transform",
												expanded && "rotate-180",
											)}
										/>
									</StoreButton>
								</div>
								{expanded && (
									<div id={`order-${order.code}`}>
										<OrderDetail code={order.code} />
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}

function OrderDetail({ code }: { code: string }) {
	const money = useMoney();
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
	const o = order.data;
	return (
		<div className="mt-4 grid gap-5 border-t pt-4">
			<OrderTimeline
				status={o.status}
				paymentMethod={o.paymentMethod}
				history={o.statusHistory}
			/>
			<ul className="grid gap-1.5 type-small">
				{o.lines.map((line) => (
					<li key={line.sku} className="flex justify-between gap-4">
						<span>
							{line.quantity} × {line.brandName} {line.productName}
							{line.optionLabel && (
								<span className="text-muted-foreground">
									{" "}
									· {line.optionLabel}
								</span>
							)}
						</span>
						<span className="tabular-nums">
							{money(line.unitPrice * line.quantity)}
						</span>
					</li>
				))}
			</ul>
			<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
				<p className="type-small">
					{m.cart_total()}:{" "}
					<span className="font-semibold tabular-nums">{money(o.total)}</span>
				</p>
				<Link
					to="/pedido/$code"
					params={{ code: o.code }}
					className="type-small text-brand underline-offset-4 hover:underline"
				>
					{m.account_order_track()}
				</Link>
			</div>
		</div>
	);
}
