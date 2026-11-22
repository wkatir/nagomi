import { cn } from "cn";
import type { InferResponseType } from "hono/client";
import { Check, Landmark, X } from "lucide-react";
import { useMoney } from "#/hooks/use-money";
import { useCalendarDate, useStoreDate } from "#/hooks/use-store-date";
import type { api } from "#/lib/api";
import type { OrderStatus } from "#/lib/enums";
import { paymentLabel } from "#/lib/payment";
import { m } from "#/paraglide/messages";

export type PublicOrder = InferResponseType<
	ReturnType<typeof api>["orders"][":code"]["$get"],
	200
>;

export const orderStatusText = {
	pending: m.account_order_status_pending,
	paid: m.account_order_status_paid,
	shipped: m.account_order_status_shipped,
	delivered: m.account_order_status_delivered,
	cancelled: m.account_order_status_cancelled,
} as const;

const STEPS = ["pending", "paid", "shipped", "delivered"] as const;

const statusTone: Record<OrderStatus, string> = {
	pending: "bg-warning/10 text-warning",
	paid: "bg-primary/15 text-primary",
	shipped: "bg-primary/15 text-primary",
	delivered: "bg-success/10 text-success",
	cancelled: "bg-destructive/10 text-destructive",
};

export function OrderStatusBadge({
	status,
	className,
}: {
	status: OrderStatus;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 type-meta font-medium",
				statusTone[status],
				className,
			)}
		>
			<span aria-hidden className="size-1.5 rounded-full bg-current" />
			{orderStatusText[status]()}
		</span>
	);
}

export function OrderTimeline({
	status,
	paymentMethod,
	history,
	className,
}: {
	status: OrderStatus;
	paymentMethod: string;
	history: readonly { to: OrderStatus; at: string }[];
	className?: string;
}) {
	const formatDate = useStoreDate();
	const at = (step: OrderStatus) =>
		history.find((h) => h.to === step)?.at ?? null;
	const steps: OrderStatus[] =
		status === "cancelled"
			? [
					...history.map((h) => h.to).filter((s) => s !== "cancelled"),
					"cancelled",
				]
			: STEPS.filter(
					(s) =>
						!(
							s === "paid" &&
							paymentMethod === "cash_on_delivery" &&
							!at("paid")
						),
				);
	const reached = steps.filter((s) => at(s)).length;
	return (
		<ol
			className={cn(
				"grid gap-4 md:grid-flow-col md:auto-cols-fr md:gap-0",
				className,
			)}
		>
			{steps.map((step, index) => {
				const when = at(step);
				const done = when !== null;
				const current = done && index === reached - 1;
				const cancelled = step === "cancelled";
				return (
					<li
						key={step}
						aria-current={current ? "step" : undefined}
						className="relative flex gap-3 md:flex-col md:items-center md:gap-2 md:text-center"
					>
						{index < steps.length - 1 && (
							<span
								aria-hidden
								className={cn(
									"absolute top-8 left-[0.9375rem] h-[calc(100%-1rem)] w-px md:top-[0.9375rem] md:left-[calc(50%+1.25rem)] md:h-px md:w-[calc(100%-2.5rem)]",
									index < reached - 1 ? "bg-primary" : "bg-border",
								)}
							/>
						)}
						<span
							aria-hidden
							className={cn(
								"relative z-10 flex size-[1.875rem] shrink-0 items-center justify-center rounded-full border",
								cancelled
									? "border-destructive bg-destructive/15 text-destructive"
									: done
										? "border-primary bg-primary text-primary-foreground"
										: "border-input bg-background text-muted-foreground",
								current && !cancelled && "ring-4 ring-primary/25",
							)}
						>
							{cancelled ? (
								<X className="size-4" />
							) : done ? (
								<Check className="size-4" />
							) : (
								<span className="type-meta">{index + 1}</span>
							)}
						</span>
						<span className="pt-1 md:pt-0">
							<span
								className={cn(
									"block type-small font-medium",
									!done && "text-muted-foreground",
								)}
							>
								{orderStatusText[step]()}
								<span className="sr-only">
									{" "}
									{done ? m.order_step_done() : m.order_step_pending()}
								</span>
							</span>
							{when && (
								<span className="block type-meta text-muted-foreground">
									{formatDate(when, {
										dateStyle: "medium",
										timeStyle: "short",
									})}
								</span>
							)}
						</span>
					</li>
				);
			})}
		</ol>
	);
}

export function OrderSummary({ order }: { order: PublicOrder }) {
	const money = useMoney();
	return (
		<div className="grid gap-4">
			<ul className="grid gap-3">
				{order.items.map((i) => (
					<li
						key={`${i.kind}-${i.sku ?? i.name}`}
						className="flex justify-between gap-4 type-small"
					>
						<span className="min-w-0">
							<span className="font-medium">{i.name}</span>
							<span className="block type-meta text-muted-foreground">
								{m.checkout_line_quantity({ count: i.quantity })}
								{i.optionLabel && ` · ${i.optionLabel}`}
							</span>
							{i.components.length > 0 && (
								<span className="block type-meta text-muted-foreground">
									{i.components.map((c) => c.name).join(", ")}
								</span>
							)}
						</span>
						<span className="tabular-nums">{money(i.lineTotal)}</span>
					</li>
				))}
			</ul>
			<dl className="grid gap-2 border-t pt-4 type-small">
				<div className="flex justify-between">
					<dt className="text-foreground-secondary">{m.cart_subtotal()}</dt>
					<dd className="tabular-nums">{money(order.subtotal)}</dd>
				</div>
				{order.discount > 0 && (
					<div className="flex justify-between text-success">
						<dt>{m.cart_discount({ code: order.discountReason ?? "" })}</dt>
						<dd className="tabular-nums">−{money(order.discount)}</dd>
					</div>
				)}
				<div className="flex justify-between gap-4">
					<dt className="text-foreground-secondary">
						{order.shippingZoneName
							? m.checkout_shipping_to({ zone: order.shippingZoneName })
							: m.cart_shipping()}
					</dt>
					<dd className="tabular-nums">
						{order.shipping === 0
							? m.cart_shipping_free()
							: money(order.shipping)}
					</dd>
				</div>
				<div className="mt-1 flex items-baseline justify-between border-t pt-3">
					<dt className="type-body font-semibold">{m.cart_total()}</dt>
					<dd className="text-xl font-semibold tabular-nums">
						{money(order.total)}
					</dd>
				</div>
				<div className="type-meta text-muted-foreground">
					<dt className="sr-only">{m.product_tax_included()}</dt>
					<dd>{m.order_iva_included({ amount: money(order.taxIncluded) })}</dd>
				</div>
			</dl>
		</div>
	);
}

export function OrderDelivery({ order }: { order: PublicOrder }) {
	const calendarDate = useCalendarDate();
	return (
		<dl className="grid gap-3 type-small">
			<div>
				<dt className="type-meta text-muted-foreground">
					{m.checkout_payment()}
				</dt>
				<dd>{paymentLabel[order.paymentMethod]()}</dd>
			</div>
			{order.address.addressLine && (
				<div>
					<dt className="type-meta text-muted-foreground">
						{m.checkout_delivery()}
					</dt>
					<dd>
						{[
							order.address.addressLine,
							order.address.municipality,
							order.address.department,
						].join(", ")}
						{order.address.reference && (
							<span className="block text-muted-foreground">
								{order.address.reference}
							</span>
						)}
					</dd>
				</div>
			)}
			{order.deliveryEstimate && order.status !== "cancelled" && (
				<div>
					<dt className="type-meta text-muted-foreground">
						{m.order_estimate_label()}
					</dt>
					<dd>
						{m.order_estimate_range({
							from: calendarDate(order.deliveryEstimate.from),
							to: calendarDate(order.deliveryEstimate.to),
						})}
					</dd>
				</div>
			)}
			{order.courier && (
				<div>
					<dt className="type-meta text-muted-foreground">
						{m.order_courier_label()}
					</dt>
					<dd>
						{order.courier}
						{order.trackingCode && (
							<span className="block font-medium tabular-nums">
								{m.order_tracking_code({ code: order.trackingCode })}
							</span>
						)}
					</dd>
				</div>
			)}
		</dl>
	);
}

export function BankTransferBox({
	transfer,
	total,
}: {
	transfer: NonNullable<PublicOrder["bankTransfer"]>;
	total: number;
}) {
	const money = useMoney();
	return (
		<section
			aria-labelledby="bank-title"
			className="panel grid gap-3 border-primary/40 p-5"
		>
			<h2 id="bank-title" className="flex items-center gap-2 type-h3">
				<Landmark aria-hidden className="size-5 text-brand" />
				{m.order_bank_title()}
			</h2>
			<dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 type-small">
				<dt className="text-muted-foreground">{m.order_bank_bank()}</dt>
				<dd>{transfer.bank}</dd>
				<dt className="text-muted-foreground">{m.order_bank_type()}</dt>
				<dd>{transfer.accountType}</dd>
				<dt className="text-muted-foreground">{m.order_bank_number()}</dt>
				<dd className="font-medium tabular-nums">{transfer.accountNumber}</dd>
				<dt className="text-muted-foreground">{m.order_bank_holder()}</dt>
				<dd>{transfer.accountHolder}</dd>
				<dt className="text-muted-foreground">{m.cart_total()}</dt>
				<dd className="font-semibold tabular-nums">{money(total)}</dd>
			</dl>
			<p className="rounded-lg bg-accent/50 px-3 py-2 type-small">
				{m.order_bank_reference({ code: transfer.reference })}
			</p>
			<p className="type-meta text-muted-foreground">
				{m.order_bank_due({ hours: String(transfer.dueHours) })}
			</p>
		</section>
	);
}
