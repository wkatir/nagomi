import { describe, expect, test } from "bun:test";
import { renderWithStore } from "#/lib/test-store";
import { m } from "#/paraglide/messages";
import type { Supplier, SupplierItem } from "./queries";
import { supplierItemsQuery } from "./queries";
import { SupplierItems } from "./supplier-items";

const supplier: Supplier = {
	id: 1,
	name: "Alpha",
	contactName: null,
	phoneE164: null,
	email: null,
	paymentTerms: null,
	leadTimeDays: 7,
	notes: null,
	status: "active",
	createdAt: "2026-09-01T10:00:00Z",
	updatedAt: "2026-09-01T10:00:00Z",
	openPurchaseOrders: 0,
	openOrders: [],
};
const item = (change: Partial<SupplierItem>): SupplierItem => ({
	id: 1,
	supplierId: 1,
	supplier: "Alpha",
	supplierStatus: "active",
	leadTimeDays: 7,
	variantId: 1,
	sku: "OIL-50",
	brand: "Brand",
	name: "Aceite",
	optionLabel: null,
	supplierSku: null,
	packSize: null,
	minOrderQuantity: null,
	isPreferred: false,
	status: "active",
	updatedAt: "2026-09-01T10:00:00Z",
	...change,
});

const html = (items: SupplierItem[], forSupplier: Supplier = supplier) =>
	renderWithStore(<SupplierItems supplier={forSupplier} />, (queryClient) =>
		queryClient.setQueryData(supplierItemsQuery(1).queryKey, items),
	);

describe("SupplierItems", () => {
	test("lists each product by its name, option and SKU", () => {
		const out = html([
			item({}),
			item({ id: 2, variantId: 2, sku: "TEC-002", optionLabel: "Negro" }),
		]);
		expect(out).toContain("Brand Aceite");
		expect(out).toContain("Brand Aceite Negro");
		expect(out).toContain("OIL-50");
		expect(out).toContain("TEC-002");
	});

	test("says what the supplier ships it as: its code, pack and minimum", () => {
		const out = html([
			item({ supplierSku: "AC-50", packSize: 6, minOrderQuantity: 12 }),
		]);
		expect(out).toContain(
			`OIL-50 · ${m.admin_supplier_item_code({ code: "AC-50" })} · ${m.admin_supplier_item_pack({ count: 6 })} · ${m.admin_supplier_item_minimum({ count: 12 })}`,
		);
		const bare = html([item({})]);
		expect(bare).not.toContain(m.admin_supplier_item_pack({ count: 6 }));
		expect(bare).not.toContain("·");
	});

	test("marks the preferred source and dims the archived products", () => {
		const out = html([
			item({ isPreferred: true }),
			item({ id: 2, variantId: 2, sku: "OIL-100", status: "archived" }),
		]);
		expect(out.split(m.admin_supplier_item_preferred())).toHaveLength(2);
		expect(out).toContain('data-archived="true"');
		expect(out).toContain('data-archived="false"');
		expect(out).toContain(m.admin_supplier_status_archived());
	});

	test("offers to add a product, and has an action menu for each", () => {
		const out = html([item({})]);
		expect(out).toContain(m.admin_supplier_item_new());
		expect(out).toContain(
			m.admin_supplier_item_actions({ name: "Brand Aceite" }),
		);
	});

	test("explains an empty list, with the way to start it", () => {
		const out = html([]);
		expect(out).toContain(m.admin_supplier_items_empty());
		expect(out).toContain(m.admin_supplier_item_new());
	});

	test("takes no change for an archived supplier: no add button and no menus", () => {
		const archived: Supplier = { ...supplier, status: "archived" };
		const out = html([item({})], archived);
		expect(out).toContain("Brand Aceite");
		expect(out).not.toContain(m.admin_supplier_item_new());
		expect(out).not.toContain(
			m.admin_supplier_item_actions({ name: "Brand Aceite" }),
		);
		const empty = html([], archived);
		expect(empty).toContain(m.admin_supplier_items_empty());
		expect(empty).not.toContain(m.admin_supplier_item_new());
	});
});
