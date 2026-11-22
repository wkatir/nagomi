import type { ReactNode } from "react";
import { toast } from "sonner";
import {
	channelLabel,
	consentPurposeLabel,
	dispositionLabel,
	orderStatusLabel,
	returnReasonLabel,
	shippingMethodLabel,
} from "#/components/admin/labels";
import { Panel } from "#/components/admin/panel";
import { Fact, Section } from "#/components/admin/section";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion";
import { Button } from "#/components/ui/button";
import { useMoney } from "#/hooks/use-money";
import { useCalendarDate, useStoreDate } from "#/hooks/use-store-date";
import type { AdminOrder } from "#/lib/api";
import { paymentLabel } from "#/lib/payment";
import { whatsappLink } from "#/lib/whatsapp";
import { m } from "#/paraglide/messages";

// A list, not a table: a line is a name and two figures, which fits any width.
export function OrderLines({
	detail,
	action,
}: {
	detail: AdminOrder;
	action?: ReactNode;
}) {
	const money = useMoney();
	const { order, lines } = detail;
	return (
		<Section title={m.admin_order_lines()} action={action}>
			<ul>
				{lines.map((line) => (
					<li
						key={line.id}
						className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-b p-admin-card"
					>
						<span className="type-small">
							{line.brandName} {line.name}
							{line.optionLabel ? ` · ${line.optionLabel}` : ""}
						</span>
						<span className="type-small text-right font-bold tabular-nums">
							{money(line.quantity * line.unitPrice)}
						</span>
						<span className="type-meta text-muted-foreground">
							{line.sku}
							{line.lots.length > 0 &&
								` · ${line.lots
									.map((lot) => `${lot.code ?? `#${lot.lotId}`} × ${lot.units}`)
									.join(", ")}`}
						</span>
						<span className="type-meta text-right text-muted-foreground tabular-nums">
							{line.quantity} × {money(line.unitPrice)}
							{line.returned > 0 &&
								` · ${m.admin_order_returned_n({ count: line.returned })}`}
						</span>
					</li>
				))}
			</ul>
			<dl className="type-small grid gap-1.5 p-admin-card tabular-nums">
				<div className="flex justify-between gap-4">
					<dt className="text-muted-foreground">{m.admin_order_subtotal()}</dt>
					<dd>{money(order.subtotal)}</dd>
				</div>
				{order.discount > 0 && (
					<div className="flex justify-between gap-4">
						<dt className="text-muted-foreground">
							{order.discountReason ?? m.admin_order_discount()}
						</dt>
						<dd>-{money(order.discount)}</dd>
					</div>
				)}
				{order.shipping > 0 && (
					<div className="flex justify-between gap-4">
						<dt className="text-muted-foreground">
							{m.admin_order_shipping()}
						</dt>
						<dd>{money(order.shipping)}</dd>
					</div>
				)}
				<div className="flex justify-between gap-4 border-t pt-2 font-bold">
					<dt>{m.admin_order_total()}</dt>
					<dd>{money(order.total)}</dd>
				</div>
			</dl>
		</Section>
	);
}

export function OrderPayments({
	detail,
	action,
}: {
	detail: AdminOrder;
	action?: ReactNode;
}) {
	const money = useMoney();
	const formatDate = useStoreDate();
	const { payment, payments, refunds, order } = detail;
	const rows = [...payments, ...refunds].sort((a, b) =>
		a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0,
	);
	const figures = [
		[m.admin_order_owed(), payment.owed],
		[m.admin_order_paid_amount(), payment.paid],
		[m.admin_order_refunded_amount(), payment.refunded],
		[m.admin_order_balance(), payment.balance],
	] as const;
	return (
		<Section title={m.admin_order_payments()} action={action}>
			<dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-admin-card sm:grid-cols-4">
				{figures.map(([label, amount]) => (
					<div key={label}>
						<dt className="type-meta text-muted-foreground">{label}</dt>
						<dd className="type-ui font-bold tabular-nums">{money(amount)}</dd>
					</div>
				))}
			</dl>
			{rows.length === 0 ? (
				<p className="type-small border-t p-admin-card text-muted-foreground">
					{m.admin_order_no_payments()}
					{order.paymentMethod &&
						` ${m.admin_order_payment_method_line()}: ${paymentLabel[order.paymentMethod]()}.`}
				</p>
			) : (
				<ul className="border-t">
					{rows.map((row) => (
						<li
							key={row.id}
							className="grid grid-cols-[1fr_auto] gap-x-4 border-b p-admin-card last:border-b-0"
						>
							<span className="type-small">
								{row.kind === "refund" ? `${m.admin_order_refund_n()} · ` : ""}
								{paymentLabel[row.method]()}
								{row.reference ? ` · ${row.reference}` : ""}
							</span>
							<span className="type-small text-right tabular-nums">
								{row.kind === "refund" ? "-" : ""}
								{money(row.amount)}
							</span>
							<span className="type-meta col-span-2 text-muted-foreground">
								{formatDate(row.recordedAt, {
									dateStyle: "medium",
									timeStyle: "short",
								})}
								{row.recordedByName ? ` · ${row.recordedByName}` : ""}
							</span>
						</li>
					))}
				</ul>
			)}
		</Section>
	);
}

export function OrderReturns({ detail }: { detail: AdminOrder }) {
	const formatDate = useStoreDate();
	const names = new Map(
		detail.lines.map((line) => [line.id, `${line.brandName} ${line.name}`]),
	);
	const nameOf = (orderItemId: number) => {
		const name = names.get(orderItemId);
		if (name === undefined)
			throw new Error(
				`Return line points at order item ${orderItemId}, not on order ${detail.order.code}`,
			);
		return name;
	};
	return (
		<Section title={m.admin_order_returns()}>
			<ul>
				{detail.returns.map((ret) => (
					<li
						key={ret.id}
						className="grid gap-1 border-b p-admin-card last:border-b-0"
					>
						<span className="type-small font-bold">
							{returnReasonLabel[ret.reason]()}
						</span>
						<span className="type-meta text-muted-foreground">
							{formatDate(ret.createdAt, {
								dateStyle: "medium",
								timeStyle: "short",
							})}
						</span>
						{ret.lines.map((line) => (
							<span
								key={`${line.orderItemId}-${line.lotId}`}
								className="type-small"
							>
								{m.admin_order_return_line({
									count: line.quantity,
									product: nameOf(line.orderItemId),
								})}
								<span className="text-muted-foreground">
									{" "}
									· {dispositionLabel[line.disposition]()}
									{line.lotCode ? ` · ${line.lotCode}` : ""}
								</span>
							</span>
						))}
						{ret.note && (
							<span className="type-small text-muted-foreground">
								{ret.note}
							</span>
						)}
					</li>
				))}
			</ul>
		</Section>
	);
}

export function OrderCustomer({ detail }: { detail: AdminOrder }) {
	const { order } = detail;
	return (
		<Section title={m.admin_col_customer()}>
			<dl className="grid gap-3 p-admin-card">
				<Fact
					label={m.admin_order_customer_name()}
					value={order.customerName}
				/>
				<Fact label={m.admin_order_phone()} value={order.customerPhone} />
				<Fact label={m.admin_field_email()} value={order.customerEmail} />
				<Fact
					label={m.admin_order_channel()}
					value={channelLabel[order.channel]()}
				/>
			</dl>
		</Section>
	);
}

export function OrderDelivery({ detail }: { detail: AdminOrder }) {
	const formatDay = useCalendarDate();
	const { order } = detail;
	const estimate =
		order.deliveryEstimateFrom && order.deliveryEstimateTo
			? order.deliveryEstimateFrom === order.deliveryEstimateTo
				? formatDay(order.deliveryEstimateFrom)
				: `${formatDay(order.deliveryEstimateFrom)} - ${formatDay(order.deliveryEstimateTo)}`
			: null;
	const method =
		order.shippingMethod &&
		[shippingMethodLabel[order.shippingMethod](), order.shippingZoneName]
			.filter(Boolean)
			.join(" · ");
	if (!method && !order.notes && !order.cancelReason) return null;
	return (
		<Section title={m.admin_order_delivery_section()}>
			<dl className="grid gap-3 p-admin-card">
				<Fact label={m.admin_order_shipping_method()} value={method} />
				<Fact label={m.admin_order_ship_to()} value={order.shipTo} />
				<Fact label={m.admin_order_delivery_estimate()} value={estimate} />
				<Fact label={m.admin_order_notes()} value={order.notes} />
				<Fact
					label={m.admin_order_cancelled_reason()}
					value={order.cancelReason}
				/>
			</dl>
		</Section>
	);
}

function MessageActions({
	message,
	phone,
}: {
	message: string;
	phone: string | null;
}) {
	return (
		<div className="mt-3 flex flex-wrap gap-2">
			<Button
				type="button"
				size="sm"
				variant="outline"
				onClick={async () => {
					try {
						await navigator.clipboard.writeText(message);
						toast.success(m.admin_order_message_copied());
					} catch {
						toast.error(m.error_generic());
					}
				}}
			>
				{m.admin_order_copy_message()}
			</Button>
			{phone && (
				<Button size="sm" variant="outline" asChild>
					<a
						href={whatsappLink(phone.replace(/\D/g, ""), message)}
						target="_blank"
						rel="noreferrer"
					>
						{m.admin_order_send_whatsapp()}
					</a>
				</Button>
			)}
		</div>
	);
}

type Event = AdminOrder["audit"][number];

// `data` is whatever the API wrote, so each piece is checked before use; an action this does
// not know shows its own name.
function eventText(event: Event, money: (amount: number) => string): string {
	const data = (event.data ?? {}) as Record<string, unknown>;
	switch (event.action) {
		case "order.create":
			return m.admin_event_order_create();
		case "order.update":
			return m.admin_event_order_update();
		case "order.status": {
			const label = (status: unknown) =>
				typeof status === "string" && status in orderStatusLabel
					? orderStatusLabel[status as keyof typeof orderStatusLabel]()
					: String(status);
			return m.admin_event_order_status({
				from: label(data.from),
				to: label(data.to),
			});
		}
		case "payment.create":
			return typeof data.amount === "number"
				? (data.kind === "refund"
						? m.admin_event_refund
						: m.admin_event_payment)({ amount: money(data.amount) })
				: event.action;
		case "return.create":
			return m.admin_event_return();
		default:
			return event.action;
	}
}

export function OrderMore({ detail }: { detail: AdminOrder }) {
	const money = useMoney();
	const formatDate = useStoreDate();
	const { order, consents, audit } = detail;
	return (
		<Panel>
			<Accordion
				type="multiple"
				defaultValue={["timeline"]}
				className="px-admin-card"
			>
				{order.confirmationMessage && (
					<AccordionItem value="message">
						<AccordionTrigger>
							{m.admin_order_confirmation_message()}
						</AccordionTrigger>
						<AccordionContent>
							<p className="type-small break-words whitespace-pre-line">
								{order.confirmationMessage}
							</p>
							<MessageActions
								message={order.confirmationMessage}
								phone={order.customerPhone}
							/>
						</AccordionContent>
					</AccordionItem>
				)}
				{consents.length > 0 && (
					<AccordionItem value="consents">
						<AccordionTrigger>{m.admin_order_consents()}</AccordionTrigger>
						<AccordionContent>
							<ul className="grid gap-3">
								{consents.map((consent) => (
									<li key={consent.id} className="grid">
										<span className="type-small">
											{consentPurposeLabel[consent.purpose]()}
											{" · "}
											{consent.granted
												? m.admin_consent_granted()
												: m.admin_consent_revoked()}
										</span>
										<span className="type-meta text-muted-foreground">
											{formatDate(consent.recordedAt, {
												dateStyle: "medium",
												timeStyle: "short",
											})}
										</span>
									</li>
								))}
							</ul>
						</AccordionContent>
					</AccordionItem>
				)}
				<AccordionItem value="timeline">
					<AccordionTrigger>{m.admin_order_timeline()}</AccordionTrigger>
					<AccordionContent>
						<ol className="grid gap-4 border-l pl-4">
							{audit.map((event) => (
								<li
									key={event.id}
									className="relative grid before:absolute before:top-1.5 before:-left-[1.3rem] before:size-2 before:rounded-full before:bg-muted-foreground/60"
								>
									<span className="type-small">
										{eventText(event, money)}
										{event.actorName
											? ` ${m.admin_event_by({ name: event.actorName })}`
											: ""}
									</span>
									<span className="type-meta text-muted-foreground">
										{formatDate(event.createdAt, {
											dateStyle: "medium",
											timeStyle: "short",
										})}
									</span>
								</li>
							))}
						</ol>
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</Panel>
	);
}
