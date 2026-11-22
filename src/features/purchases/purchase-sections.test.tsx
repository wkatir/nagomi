import { describe, expect, test } from "bun:test";
import { renderWithStore } from "#/lib/test-store";
import { m } from "#/paraglide/messages";
import { PurchaseLines, PurchaseReceipts } from "./purchase-sections";
import type { Purchase } from "./queries";

type Item = Purchase["items"][number];
type Receipt = Purchase["receipts"][number];
type ReceiptLine = Receipt["lines"][number];

const mouse: Item = {
	id: 4,
	variantId: 1,
	sku: "RAT-050",
	brand: "Brand",
	name: "Ratón",
	optionLabel: null,
	quantity: 20,
	received: 8,
	unitCost: 650,
};
const keyboard: Item = {
	id: 5,
	variantId: 3,
	sku: "TEC-030",
	brand: "Brand",
	name: "Teclado",
	optionLabel: "Negro",
	quantity: 10,
	received: 0,
	unitCost: 400,
};
const line: ReceiptLine = {
	id: 1,
	purchaseOrderItemId: 4,
	quantity: 8,
	lotId: 1,
	lotCode: "L1",
	landedUnitCost: 669,
};
const receipt: Receipt = {
	id: 1,
	receivedOn: "2026-10-12",
	supplierInvoiceRef: "F-77",
	shippingCost: 150,
	notes: "One box dented",
	createdAt: "2026-10-12T16:30:00Z",
	createdByName: "Admin",
	lines: [line],
};
const purchase: Purchase = {
	id: 3,
	reference: "B-7",
	status: "partially_received",
	supplierId: 2,
	supplier: "Beta",
	orderedOn: "2026-10-05",
	createdAt: "2026-10-05T12:00:00Z",
	units: 30,
	receivedUnits: 8,
	total: 17000,
	taxIncluded: null,
	notes: null,
	cancelledAt: null,
	createdBy: "admin",
	createdByName: "Admin",
	supplierStatus: "active",
	supplierLeadTimeDays: 14,
	items: [mouse, keyboard],
	receipts: [receipt],
};

describe("PurchaseLines", () => {
	test("lists each line with what arrived of it, its cost and what it comes to", () => {
		const out = renderWithStore(<PurchaseLines purchase={purchase} />);
		expect(out).toContain("Brand Ratón");
		expect(out).toContain("Brand Teclado Negro");
		// 20 × 6.50 and 10 × 4.00.
		expect(out).toContain("$130.00");
		expect(out).toContain("$40.00");
		expect(out).toContain(
			`RAT-050 · ${m.admin_po_received_units({ received: 8, ordered: 20 })}`,
		);
		expect(out).not.toContain(
			m.admin_po_received_units({ received: 0, ordered: 10 }),
		);
		expect(out).toContain(
			m.admin_po_received_units({ received: 8, ordered: 30 }),
		);
		expect(out).toContain("$170.00");
	});

	test("shows the action of the card", () => {
		const out = renderWithStore(
			<PurchaseLines purchase={purchase} action={<span>Receive now</span>} />,
		);
		expect(out).toContain("Receive now");
	});

	test("says a draft line has no cost yet, and only a draft's", () => {
		const free: Item = { ...keyboard, unitCost: 0 };
		const draft: Purchase = { ...purchase, status: "draft", items: [free] };
		expect(renderWithStore(<PurchaseLines purchase={draft} />)).toContain(
			m.admin_purchase_cost_pending(),
		);
		const placed: Purchase = { ...purchase, items: [free] };
		expect(renderWithStore(<PurchaseLines purchase={placed} />)).not.toContain(
			m.admin_purchase_cost_pending(),
		);
	});
});

describe("PurchaseReceipts", () => {
	test("gives each delivery its day, invoice, shipping and the lots it created at landed cost", () => {
		const out = renderWithStore(<PurchaseReceipts purchase={purchase} />);
		expect(out).toContain(m.admin_purchase_invoice({ ref: "F-77" }));
		expect(out).toContain(m.admin_purchase_shipping_paid({ amount: "$1.50" }));
		expect(out).toContain("8 × Brand Ratón");
		expect(out).toContain(m.admin_unit_cost({ amount: "$6.69" }));
		expect(out).toContain(m.admin_batch({ code: "L1" }));
		expect(out).toContain("One box dented");
	});

	test("fails on a delivery line of no line of the order", () => {
		const stray: Purchase = {
			...purchase,
			receipts: [{ ...receipt, lines: [{ ...line, purchaseOrderItemId: 99 }] }],
		};
		expect(() =>
			renderWithStore(<PurchaseReceipts purchase={stray} />),
		).toThrow("of no line of purchase order 3");
	});
});
