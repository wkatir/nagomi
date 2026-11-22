import { cn } from "cn";
import type { InferResponseType } from "hono/client";
import { useMoney } from "#/hooks/use-money";
import type { api } from "#/lib/api";
import { formatCalendarDate } from "#/lib/dates";
import { intlLocale } from "#/lib/intl";
import { paymentLabel } from "#/lib/payment";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

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

// The steps of the order, each with the moment it happened (order_status_history).
export function OrderTimeline({ order }: { order: PublicOrder }) {
	const locale = getLocale();
	const at = (status: string) =>
		order.history.find((h) => h.to === status)?.at ?? null;
	const steps =
		order.status === "cancelled"
			? [...order.history.map((h) => h.to)]
			: STEPS.filter(
					(s) =>
						!(
							s === "paid" &&
							order.paymentMethod === "cash_on_delivery" &&
							!at("paid")
						),
				);
	return (
		<ol className="grid gap-3">
			{steps.map((status) => {
				const when = at(status);
				return (
					<li key={status} className="flex items-start gap-3">
						<span
							aria-hidden
							className={cn(
								"mt-1.5 size-2.5 shrink-0 rounded-full",
								when ? "bg-foreground" : "border border-muted-foreground",
							)}
						/>
						<span>
							<span
								className={cn("font-medium", !when && "text-muted-foreground")}
							>
								{orderStatusText[status]()}
							</span>
							{when && (
								<span className="block type-meta text-muted-foreground">
									{new Date(when).toLocaleString(locale, {
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
	const locale = getLocale();
	const intl = intlLocale(locale, "SV");
	return (
		<div className="grid gap-6">
			<ul className="grid gap-2 border-t pt-4">
				{order.items.map((i) => (
					<li
						key={`${i.kind}-${i.name}`}
						className="flex justify-between gap-4"
					>
						<span>
							{i.quantity} × {i.name}
							{i.optionLabel && (
								<span className="text-muted-foreground">
									{" "}
									· {i.optionLabel}
								</span>
							)}
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
			<dl className="grid gap-1 border-t pt-4">
				<div className="flex justify-between">
					<dt>{m.cart_subtotal()}</dt>
					<dd className="tabular-nums">{money(order.subtotal)}</dd>
				</div>
				{order.discount > 0 && (
					<div className="flex justify-between text-success">
						<dt>{m.cart_discount({ code: order.discountReason ?? "" })}</dt>
						<dd className="tabular-nums">−{money(order.discount)}</dd>
					</div>
				)}
				<div className="flex justify-between">
					<dt>
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
				<div className="flex justify-between font-bold">
					<dt>{m.cart_total()}</dt>
					<dd className="tabular-nums">{money(order.total)}</dd>
				</div>
				<div className="type-small text-muted-foreground">
					{m.order_iva_included({ amount: money(order.taxIncluded) })}
				</div>
			</dl>
			<dl className="grid gap-1 type-small">
				<div>
					<dt className="font-medium">{m.checkout_payment()}</dt>
					<dd>{paymentLabel[order.paymentMethod]()}</dd>
				</div>
				{order.address.addressLine && (
					<div>
						<dt className="font-medium">{m.checkout_delivery()}</dt>
						<dd>
							{[
								order.address.addressLine,
								order.address.municipality,
								order.address.department,
							].join(", ")}
							{order.address.reference && ` (${order.address.reference})`}
						</dd>
					</div>
				)}
				{order.deliveryEstimate && order.status !== "cancelled" && (
					<div>
						<dd>
							{m.order_estimate({
								from: formatCalendarDate(order.deliveryEstimate.from, intl),
								to: formatCalendarDate(order.deliveryEstimate.to, intl),
							})}
						</dd>
					</div>
				)}
				{order.courier && (
					<dd>{m.order_courier({ courier: order.courier })}</dd>
				)}
				{order.trackingCode && (
					<dd>{m.order_tracking_code({ code: order.trackingCode })}</dd>
				)}
			</dl>
		</div>
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
		<section className="grid gap-2 border p-5">
			<h2 className="type-h4">{m.order_bank_title()}</h2>
			<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 type-small">
				<dt>{m.order_bank_bank()}</dt>
				<dd>{transfer.bank}</dd>
				<dt>{m.order_bank_type()}</dt>
				<dd>{transfer.accountType}</dd>
				<dt>{m.order_bank_number()}</dt>
				<dd className="font-medium tabular-nums">{transfer.accountNumber}</dd>
				<dt>{m.order_bank_holder()}</dt>
				<dd>{transfer.accountHolder}</dd>
				<dt>{m.cart_total()}</dt>
				<dd className="font-medium tabular-nums">{money(total)}</dd>
			</dl>
			<p className="type-small">
				{m.order_bank_reference({ code: transfer.reference })}
			</p>
			<p className="type-small text-muted-foreground">
				{m.order_bank_due({ hours: String(transfer.dueHours) })}
			</p>
		</section>
	);
}
