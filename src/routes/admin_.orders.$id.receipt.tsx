import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	orderStatusLabel,
	paymentStatusLabel,
} from "#/components/admin/labels";
import "#/components/admin/admin-theme.css";
import { Logo } from "#/components/brand/wordmark";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { orderQuery } from "#/features/orders/queries";
import { useMoney } from "#/hooks/use-money";
import { useStoreDate } from "#/hooks/use-store-date";
import { errorMessage } from "#/lib/errors";
import { basisPointsLabel } from "#/lib/money";
import { paymentLabel } from "#/lib/payment";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";

// Outside the back-office frame; the order API checks the staff session.
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
		<main className="admin-paper mx-auto my-8 max-w-3xl rounded-md p-10 text-sm shadow-[0_1px_3px_rgb(20_22_42/0.12)] print:my-0 print:max-w-none print:rounded-none print:p-0">
			<div className="mb-8 flex gap-2 print:hidden">
				<Button onClick={() => window.print()}>
					{m.admin_order_print_receipt()}
				</Button>
				<Button variant="outline" asChild>
					<Link to="/admin/orders/$id" params={{ id: Number(id) }}>
						{m.admin_order_view_detail()}
					</Link>
				</Button>
			</div>
			<header className="flex justify-between gap-6 border-b-2 border-primary pb-5">
				<div className="grid gap-0.5">
					<Logo label={s.name} className="mb-2 h-12 text-primary" />
					<p>{s.business.legalName}</p>
					<p>
						{s.business.taxIdLabel} {s.business.taxId}
					</p>
					<p>{s.business.address}</p>
					<p>{s.business.email}</p>
				</div>
				<div className="grid content-start gap-0.5 text-right">
					<p className="type-meta font-bold tracking-wide text-primary uppercase">
						{m.admin_order_receipt_title()}
					</p>
					<p className="text-xl font-bold tabular-nums">{order.code}</p>
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
			<table className="mt-6 w-full">
				<thead>
					<tr className="border-b-2 text-left text-xs tracking-wide text-muted-foreground uppercase">
						<th className="py-2">SKU</th>
						<th className="py-2">{m.admin_col_product()}</th>
						<th className="py-2 text-right">{m.admin_quantity()}</th>
						<th className="py-2 text-right">{m.admin_col_price()}</th>
						<th className="py-2 text-right">{m.admin_col_total()}</th>
					</tr>
				</thead>
				<tbody>
					{lines.map((l) => (
						<tr key={l.id} className="border-b">
							<td className="py-2 tabular-nums">{l.sku}</td>
							<td className="py-2">
								{l.brandName} {l.name}
								{l.optionLabel ? ` · ${l.optionLabel}` : ""}
								{l.bundleName
									? ` (${m.admin_order_set_label()} ${l.bundleName})`
									: ""}
							</td>
							<td className="py-2 text-right tabular-nums">{l.quantity}</td>
							<td className="py-2 text-right tabular-nums">
								{money(l.unitPrice)}
							</td>
							<td className="py-2 text-right tabular-nums">
								{money(l.quantity * l.unitPrice)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<dl className="mt-6 ml-auto grid w-72 grid-cols-2 gap-y-1.5">
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
				<dt className="border-t pt-1.5 text-base font-bold">
					{m.cart_total()}
				</dt>
				<dd className="border-t pt-1.5 text-right text-base font-bold tabular-nums">
					{money(order.total)}
				</dd>
				<dt className="text-muted-foreground">
					{m.admin_order_iva_included({
						rate: s.taxRateBp === null ? "" : basisPointsLabel(s.taxRateBp),
					})}
				</dt>
				<dd className="text-right text-muted-foreground tabular-nums">
					{money(order.taxIncluded)}
				</dd>
				<dt>{m.checkout_payment()}</dt>
				<dd className="text-right">{paymentLabel[order.paymentMethod]()}</dd>
			</dl>
			<p className="mt-10 border-t pt-4 text-xs text-muted-foreground">
				{m.admin_order_receipt_note()}
			</p>
		</main>
	);
}
