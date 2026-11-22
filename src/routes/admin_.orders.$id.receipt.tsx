import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	orderStatusLabel,
	paymentStatusLabel,
} from "#/components/admin/labels";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { orderQuery } from "#/features/orders/queries";
import { useMoney } from "#/hooks/use-money";
import { useStoreDate } from "#/hooks/use-store-date";
import { errorMessage } from "#/lib/errors";
import { paymentLabel } from "#/lib/payment";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";

// A printable page, outside the back-office frame. The order API checks the staff session.
export const Route = createFileRoute("/admin_/orders/$id/receipt")({
	ssr: false,
	staticData: { noindex: true },
	component: Receipt,
});

function Receipt() {
	const { id } = Route.useParams();
	const detail = useQuery(orderQuery(Number(id)));
	const store = useQuery(storeQuery);
	const money = useMoney();
	const formatDate = useStoreDate();
	if (detail.isPending || store.isPending)
		return <Spinner aria-label={m.loading()} className="m-8" />;
	if (detail.isError)
		return <p className="m-8 text-destructive">{errorMessage(detail.error)}</p>;
	if (store.isError)
		return <p className="m-8 text-destructive">{errorMessage(store.error)}</p>;
	const { order, lines, payment } = detail.data;
	const s = store.data;
	return (
		<main className="mx-auto max-w-2xl p-8 text-sm print:p-0">
			<div className="mb-6 flex gap-2 print:hidden">
				<Button onClick={() => window.print()}>
					{m.admin_order_print_receipt()}
				</Button>
				<Button variant="outline" asChild>
					<Link to="/admin/orders/$id" params={{ id: Number(id) }}>
						{m.admin_order_view_detail()}
					</Link>
				</Button>
			</div>
			<header className="flex justify-between gap-6 border-b pb-4">
				<div>
					<p className="text-lg font-bold">{s.name}</p>
					<p>{s.business.legalName}</p>
					<p>
						{s.business.taxIdLabel} {s.business.taxId}
					</p>
					<p>{s.business.address}</p>
					<p>{s.business.email}</p>
				</div>
				<div className="text-right">
					<p className="font-bold">{m.admin_order_receipt_title()}</p>
					<p className="text-lg tabular-nums">{order.code}</p>
					<p>
						{formatDate(order.createdAt, {
							dateStyle: "long",
							timeStyle: "short",
						})}
					</p>
					<p>
						{orderStatusLabel[order.status]()} ·{" "}
						{paymentStatusLabel[payment.status]()}
					</p>
				</div>
			</header>
			<section className="grid grid-cols-2 gap-6 border-b py-4">
				<div>
					<p className="font-bold">{m.admin_col_customer()}</p>
					<p>{order.customerName}</p>
					<p>{order.customerEmail}</p>
					<p>{order.customerPhone}</p>
				</div>
				<div>
					<p className="font-bold">{m.admin_order_delivery_address()}</p>
					<p>{order.shipAddressLine}</p>
					<p>
						{[order.shipMunicipality, order.shipDepartment]
							.filter(Boolean)
							.join(", ")}
					</p>
					{order.shipReference && <p>{order.shipReference}</p>}
					{order.courier && (
						<p>
							{m.admin_order_courier()}: {order.courier}
							{order.trackingCode ? ` · ${order.trackingCode}` : ""}
						</p>
					)}
				</div>
			</section>
			<table className="mt-4 w-full">
				<thead>
					<tr className="border-b text-left">
						<th className="py-1">SKU</th>
						<th className="py-1">{m.admin_col_product()}</th>
						<th className="py-1 text-right">{m.admin_quantity()}</th>
						<th className="py-1 text-right">{m.admin_col_price()}</th>
						<th className="py-1 text-right">{m.admin_col_total()}</th>
					</tr>
				</thead>
				<tbody>
					{lines.map((l) => (
						<tr key={l.id} className="border-b">
							<td className="py-1 tabular-nums">{l.sku}</td>
							<td className="py-1">
								{l.brandName} {l.name}
								{l.optionLabel ? ` · ${l.optionLabel}` : ""}
								{l.bundleName
									? ` (${m.admin_order_set_label()} ${l.bundleName})`
									: ""}
							</td>
							<td className="py-1 text-right tabular-nums">{l.quantity}</td>
							<td className="py-1 text-right tabular-nums">
								{money(l.unitPrice)}
							</td>
							<td className="py-1 text-right tabular-nums">
								{money(l.quantity * l.unitPrice)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<dl className="mt-4 ml-auto grid w-64 grid-cols-2 gap-1">
				<dt>{m.cart_subtotal()}</dt>
				<dd className="text-right tabular-nums">{money(order.subtotal)}</dd>
				{order.discount > 0 && (
					<>
						<dt>{order.discountReason}</dt>
						<dd className="text-right tabular-nums">
							−{money(order.discount)}
						</dd>
					</>
				)}
				<dt>{m.cart_shipping()}</dt>
				<dd className="text-right tabular-nums">{money(order.shipping)}</dd>
				<dt className="font-bold">{m.cart_total()}</dt>
				<dd className="text-right font-bold tabular-nums">
					{money(order.total)}
				</dd>
				<dt className="text-muted-foreground">
					{m.admin_order_iva_included({
						rate: s.taxRateBp === null ? "" : `${s.taxRateBp / 100} %`,
					})}
				</dt>
				<dd className="text-right text-muted-foreground tabular-nums">
					{money(order.taxIncluded)}
				</dd>
				<dt>{m.checkout_payment()}</dt>
				<dd className="text-right">{paymentLabel[order.paymentMethod]()}</dd>
			</dl>
			<p className="mt-8 text-xs text-muted-foreground">
				{m.admin_order_receipt_note()}
			</p>
		</main>
	);
}
