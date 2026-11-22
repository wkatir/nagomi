import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Fact, Section } from "#/components/admin/section";
import { useMoney } from "#/hooks/use-money";
import { useCalendarDate, useStoreDate } from "#/hooks/use-store-date";
import { addDays } from "#/lib/dates";
import { variantLabel } from "#/lib/variant-label";
import { m } from "#/paraglide/messages";
import type { Purchase } from "./queries";
import { taxLabel } from "./tax";

export function PurchaseLines({
	purchase,
	action,
}: {
	purchase: Purchase;
	action?: ReactNode;
}) {
	const money = useMoney();
	return (
		<Section title={m.admin_purchase_lines()} action={action}>
			<ul>
				{purchase.items.map((item) => (
					<li
						key={item.id}
						className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-b p-admin-card"
					>
						<span className="type-small">{variantLabel(item)}</span>
						<span className="type-small text-right font-bold tabular-nums">
							{money(item.quantity * item.unitCost)}
						</span>
						<span className="type-meta text-muted-foreground">
							{item.sku}
							{item.received > 0 &&
								` · ${m.admin_po_received_units({
									received: item.received,
									ordered: item.quantity,
								})}`}
						</span>
						<span className="type-meta text-right text-muted-foreground tabular-nums">
							{item.quantity} × {money(item.unitCost)}
							{purchase.status === "draft" &&
								item.unitCost === 0 &&
								` · ${m.admin_purchase_cost_pending()}`}
						</span>
					</li>
				))}
			</ul>
			<dl className="type-small grid gap-1.5 p-admin-card tabular-nums">
				<div className="flex justify-between gap-4">
					<dt className="text-muted-foreground">{m.admin_purchase_units()}</dt>
					<dd>
						{purchase.receivedUnits > 0
							? m.admin_po_received_units({
									received: purchase.receivedUnits,
									ordered: purchase.units,
								})
							: purchase.units}
					</dd>
				</div>
				<div className="flex justify-between gap-4 border-t pt-2 font-bold">
					<dt>{m.admin_order_total()}</dt>
					<dd>{money(purchase.total)}</dd>
				</div>
			</dl>
		</Section>
	);
}

export function PurchaseReceipts({ purchase }: { purchase: Purchase }) {
	const money = useMoney();
	const formatDay = useCalendarDate();
	const formatDate = useStoreDate();
	const itemOf = new Map(purchase.items.map((item) => [item.id, item]));
	return (
		<Section title={m.admin_purchase_receipts()}>
			<ul>
				{purchase.receipts.map((receipt) => (
					<li
						key={receipt.id}
						className="border-b p-admin-card last:border-b-0"
					>
						<div className="grid grid-cols-[1fr_auto] gap-x-4">
							<span className="type-small font-bold">
								{formatDay(receipt.receivedOn)}
							</span>
							<span className="type-small text-right tabular-nums">
								{m.admin_purchase_shipping_paid({
									amount: money(receipt.shippingCost),
								})}
							</span>
							<span className="type-meta text-muted-foreground">
								{[
									receipt.supplierInvoiceRef &&
										m.admin_purchase_invoice({
											ref: receipt.supplierInvoiceRef,
										}),
									receipt.createdByName,
									formatDate(receipt.createdAt, {
										dateStyle: "medium",
										timeStyle: "short",
									}),
								]
									.filter(Boolean)
									.join(" · ")}
							</span>
						</div>
						<ul className="mt-3 grid gap-2">
							{receipt.lines.map((line) => {
								const item = itemOf.get(line.purchaseOrderItemId);
								if (!item)
									throw new Error(
										`Receipt line ${line.id} is of no line of purchase order ${purchase.id}`,
									);
								return (
									<li
										key={line.id}
										className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5"
									>
										<span className="type-small">
											{line.quantity} × {variantLabel(item)}
										</span>
										<span className="type-small text-right tabular-nums">
											{m.admin_unit_cost({
												amount: money(line.landedUnitCost),
											})}
										</span>
										<span className="type-meta text-muted-foreground">
											{m.admin_batch({
												code: line.lotCode ?? `#${line.lotId}`,
											})}
										</span>
										<span className="type-meta text-right text-muted-foreground">
											{m.admin_purchase_landed()}
										</span>
									</li>
								);
							})}
						</ul>
						{receipt.notes && (
							<p className="type-small mt-3 text-muted-foreground">
								{receipt.notes}
							</p>
						)}
					</li>
				))}
			</ul>
		</Section>
	);
}

export function PurchaseSupplier({ purchase }: { purchase: Purchase }) {
	const formatDay = useCalendarDate();
	const waiting =
		purchase.status === "ordered" || purchase.status === "partially_received";
	const expected =
		waiting && purchase.orderedOn && purchase.supplierLeadTimeDays !== null
			? addDays(purchase.orderedOn, purchase.supplierLeadTimeDays)
			: null;
	return (
		<Section title={m.admin_purchase_supplier()}>
			<dl className="grid gap-3 p-admin-card">
				<Fact
					label={m.admin_supplier_col_supplier()}
					value={
						<Link
							to="/admin/suppliers/$id"
							params={{ id: purchase.supplierId }}
							className="underline-offset-4 hover:underline"
						>
							{purchase.supplier}
						</Link>
					}
				/>
				<Fact
					label={m.admin_supplier_field_lead_time()}
					value={
						purchase.supplierLeadTimeDays !== null &&
						m.admin_supplier_lead_days({ count: purchase.supplierLeadTimeDays })
					}
				/>
				<Fact
					label={m.admin_purchase_expected()}
					value={expected && formatDay(expected)}
				/>
			</dl>
		</Section>
	);
}

export function PurchaseDetails({ purchase }: { purchase: Purchase }) {
	const formatDay = useCalendarDate();
	const formatDate = useStoreDate();
	return (
		<Section title={m.admin_purchase_details()}>
			<dl className="grid gap-3 p-admin-card">
				<Fact
					label={m.admin_purchase_ordered_on()}
					value={purchase.orderedOn && formatDay(purchase.orderedOn)}
				/>
				<Fact
					label={m.admin_purchase_created()}
					value={[
						formatDate(purchase.createdAt, { dateStyle: "medium" }),
						purchase.createdByName,
					]
						.filter(Boolean)
						.join(" · ")}
				/>
				<Fact
					label={m.admin_purchase_tax()}
					value={taxLabel(purchase.taxIncluded)}
				/>
				<Fact label={m.admin_supplier_field_notes()} value={purchase.notes} />
			</dl>
		</Section>
	);
}
