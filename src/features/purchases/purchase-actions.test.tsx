import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { m } from "#/paraglide/messages";
import { PurchaseHeaderActions, ReceiveAction } from "./purchase-actions";
import type { Purchase } from "./queries";

const base: Purchase = {
	id: 3,
	reference: "B-7",
	status: "draft",
	supplierId: 2,
	supplier: "Beta",
	orderedOn: null,
	createdAt: "2026-10-05T12:00:00Z",
	units: 30,
	receivedUnits: 0,
	total: 17000,
	taxIncluded: null,
	notes: null,
	cancelledAt: null,
	createdBy: "admin",
	createdByName: "Admin",
	supplierStatus: "active",
	supplierLeadTimeDays: 14,
	items: [],
	receipts: [],
};
const as = (status: Purchase["status"]): Purchase => ({ ...base, status });
const header = (status: Purchase["status"]) =>
	renderToStaticMarkup(
		<PurchaseHeaderActions purchase={as(status)} open={() => {}} />,
	);
const receive = (status: Purchase["status"]) =>
	renderToStaticMarkup(<ReceiveAction purchase={as(status)} open={() => {}} />);

describe("PurchaseHeaderActions", () => {
	test("a draft is placed from the header, with more actions behind a menu", () => {
		const out = header("draft");
		expect(out).toContain(m.admin_purchase_place());
		expect(out).toContain(m.admin_order_more_actions());
	});

	test("a placed order has no main button, only the menu to cancel it", () => {
		for (const status of ["ordered", "partially_received"] as const) {
			const out = header(status);
			expect(out).not.toContain(m.admin_purchase_place());
			expect(out).toContain(m.admin_order_more_actions());
		}
	});

	test("a received or cancelled one has nothing to do", () => {
		expect(header("received")).toBe("");
		expect(header("cancelled")).toBe("");
	});
});

describe("ReceiveAction", () => {
	test("receiving is offered on a placed order, whole or partly received", () => {
		expect(receive("ordered")).toContain(m.admin_po_receive());
		expect(receive("partially_received")).toContain(m.admin_po_receive());
	});

	test("and on no other", () => {
		for (const status of ["draft", "received", "cancelled"] as const)
			expect(receive(status)).toBe("");
	});
});
