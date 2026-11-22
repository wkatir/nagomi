import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase, orderSql } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";
import { searchKey } from "../../domain/search";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { ordersRouter } = await import("./orders");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/orders", ordersRouter);

type Row = {
	id: number;
	code: string;
	status: string;
	channel: string;
	customerName: string | null;
	customerPhone: string | null;
	total: number;
	createdAt: string;
	payment: { status: string; balance: number; owed: number; paid: number };
};
type Page = {
	items: Row[];
	total: number;
	page: number;
	pageSize: number;
	pageCount: number;
};
const list = async (query = ""): Promise<Page> => {
	const res = await app.request(`/orders${query ? `?${query}` : ""}`);
	expect(res.status).toBe(200);
	return (await res.json()) as Page;
};
const codes = (page: Page) => page.items.map((o) => o.code);

let db: Database;

let nextId = 0;
function order(o: {
	code: string;
	name?: string;
	customerId?: number;
	channel?: "whatsapp" | "instagram" | "in_person";
	status?: "pending" | "shipped" | "delivered" | "cancelled";
	method?: "bank_transfer" | "cash_on_delivery";
	total: number;
	createdAt: string;
	refunded?: number;
}) {
	const id = ++nextId;
	db.exec(
		orderSql({
			id,
			code: o.code,
			name: o.name ?? "Cliente",
			customerId: o.customerId ?? null,
			channel: o.channel ?? "whatsapp",
			status: o.status ?? "pending",
			method: o.method ?? "bank_transfer",
			createdAt: o.createdAt,
			paidAt: o.createdAt,
			shippedAt: o.createdAt,
			deliveredAt: o.createdAt,
			cancelledAt: o.createdAt,
			searchKey: searchKey(o.code, o.name),
			lines: [
				{ variantId: 1, quantity: 1, unitPrice: o.total, sku: "OIL-001" },
			],
		}),
	);
	if (o.refunded)
		db.exec(
			`insert into payments (order_id, kind, method, amount, status, recorded_by) values (${id}, 'refund', 'bank_transfer', ${o.refunded}, 'confirmed', 'u')`,
		);
}

beforeEach(() => {
	nextId = 0;
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, low_stock_threshold) values (1, 'Store', 'USD', 'es', 'America/El_Salvador', 'SV', 'ECL', 20, 5);
insert into customers (name, phone_e164, search_key) values ('Ana Pérez', '+50371234567', 'ana perez 50371234567');
insert into brands (slug, name, search_key) values ('b', 'Brand', 'brand b');
insert into categories (slug, icon, sort_order) values ('cleanser', 'package', 1);
insert into products (slug, brand_id, category_id) values ('oil', 1, 1);
insert into variants (product_id, sku, price, search_key) values (1, 'OIL-001', 1500, 'oil');
insert into suppliers (name, search_key) values ('Supplier', 'supplier');
insert into purchase_orders (supplier_id, reference, status, ordered_on) values (1, 'PO-1', 'ordered', '2026-01-01');
insert into purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) values (1, 1, 50, 700);
insert into purchase_receipts (purchase_order_id, received_on, created_by) values (1, '2026-01-02', 'u');
insert into purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) values (1, 1, 50, 0);
insert into lots (variant_id, receipt_line_id, unit_cost_e4) values (1, 1, 70000);
insert into inventory_movements (lot_id, kind, quantity, created_by) values (1, 'receive', 50, 'u');
`);
	env.DB = d1(db);
	order({
		code: "ECL-1",
		name: "Ana Pérez",
		customerId: 1,
		total: 1500,
		createdAt: "2026-10-01T12:00:00Z",
	});
	// 21:00 of October 1 in the store (UTC-6), though October 2 in UTC.
	order({
		code: "ECL-2",
		name: "Beto",
		channel: "instagram",
		status: "shipped",
		method: "cash_on_delivery",
		total: 3000,
		createdAt: "2026-10-02T03:00:00Z",
	});
	order({
		code: "ECL-3",
		name: "Carla",
		channel: "in_person",
		status: "delivered",
		total: 4500,
		createdAt: "2026-10-03T12:00:00Z",
	});
	order({
		code: "ECL-4",
		name: "Ana López",
		status: "cancelled",
		total: 1500,
		createdAt: "2026-10-04T12:00:00Z",
	});
	// Same instant as ECL-4: the id breaks the tie.
	order({
		code: "ECL-5",
		name: "Diego",
		status: "delivered",
		total: 2000,
		createdAt: "2026-10-04T12:00:00Z",
		refunded: 800,
	});
});

describe("GET /orders", () => {
	test("pages the newest first, with the total and the payment of each order", async () => {
		const page = await list();
		expect(codes(page)).toEqual(["ECL-5", "ECL-4", "ECL-3", "ECL-2", "ECL-1"]);
		expect(page).toMatchObject({
			total: 5,
			page: 1,
			pageSize: 25,
			pageCount: 1,
		});
		const byCode = Object.fromEntries(page.items.map((o) => [o.code, o]));
		expect(byCode["ECL-3"].payment).toMatchObject({
			status: "paid",
			owed: 4500,
			paid: 4500,
			balance: 0,
		});
		expect(byCode["ECL-5"].payment).toMatchObject({
			status: "partially_paid",
			balance: 800,
		});
		expect(byCode["ECL-1"].payment.status).toBe("unpaid");
		expect(byCode["ECL-4"].payment.status).toBe("nothing_due");
		// A row is the order's line in the table, not its lines.
		expect(Object.keys(page.items[0]).sort()).toEqual(
			[
				"channel",
				"code",
				"createdAt",
				"customerEmail",
				"customerName",
				"customerPhone",
				"id",
				"payment",
				"paymentMethod",
				"status",
				"total",
			].sort(),
		);
	});

	test("takes the page size and page the screen asks for, and answers a page past the end empty", async () => {
		// Twelve older orders: 17 in all, so a page of 10 leaves 7 for the next.
		for (let n = 6; n <= 17; n++)
			order({
				code: `ECL-${n}`,
				total: 1000,
				createdAt: `2026-09-${String(n).padStart(2, "0")}T12:00:00Z`,
			});
		const first = await list("pageSize=10");
		expect(codes(first)).toEqual([
			"ECL-5",
			"ECL-4",
			"ECL-3",
			"ECL-2",
			"ECL-1",
			"ECL-17",
			"ECL-16",
			"ECL-15",
			"ECL-14",
			"ECL-13",
		]);
		expect(first).toMatchObject({ total: 17, pageSize: 10, pageCount: 2 });
		const second = await list("pageSize=10&page=2");
		expect(codes(second)).toEqual([
			"ECL-12",
			"ECL-11",
			"ECL-10",
			"ECL-9",
			"ECL-8",
			"ECL-7",
			"ECL-6",
		]);
		expect(second).toMatchObject({ total: 17, page: 2, pageCount: 2 });
		const past = await list("pageSize=10&page=9");
		expect(past).toMatchObject({ items: [], total: 17, page: 9, pageCount: 2 });
		expect((await list("pageSize=50")).items).toHaveLength(17);
	});

	test("sorts by each column in both directions, equal values keeping the id order", async () => {
		const sorted = async (sort: string, dir: string) =>
			codes(await list(`sort=${sort}&dir=${dir}`));
		expect(await sorted("code", "asc")).toEqual([
			"ECL-1",
			"ECL-2",
			"ECL-3",
			"ECL-4",
			"ECL-5",
		]);
		expect(await sorted("code", "desc")).toEqual([
			"ECL-5",
			"ECL-4",
			"ECL-3",
			"ECL-2",
			"ECL-1",
		]);
		expect(await sorted("total", "asc")).toEqual([
			"ECL-1",
			"ECL-4",
			"ECL-5",
			"ECL-2",
			"ECL-3",
		]);
		expect(await sorted("total", "desc")).toEqual([
			"ECL-3",
			"ECL-2",
			"ECL-5",
			"ECL-4",
			"ECL-1",
		]);
		expect(await sorted("customer", "asc")).toEqual([
			"ECL-4",
			"ECL-1",
			"ECL-2",
			"ECL-3",
			"ECL-5",
		]);
		expect(await sorted("customer", "desc")).toEqual([
			"ECL-5",
			"ECL-3",
			"ECL-2",
			"ECL-1",
			"ECL-4",
		]);
		expect(await sorted("status", "asc")).toEqual([
			"ECL-4",
			"ECL-3",
			"ECL-5",
			"ECL-1",
			"ECL-2",
		]);
		expect(await sorted("status", "desc")).toEqual([
			"ECL-2",
			"ECL-1",
			"ECL-5",
			"ECL-3",
			"ECL-4",
		]);
		expect(await sorted("createdAt", "asc")).toEqual([
			"ECL-1",
			"ECL-2",
			"ECL-3",
			"ECL-4",
			"ECL-5",
		]);
	});

	test("filters by status, channel and payment status, and the total follows", async () => {
		expect(codes(await list("status=delivered"))).toEqual(["ECL-5", "ECL-3"]);
		const instagram = await list("channel=instagram");
		expect(codes(instagram)).toEqual(["ECL-2"]);
		expect(instagram.total).toBe(1);
		expect(codes(await list("paymentStatus=paid"))).toEqual(["ECL-3"]);
		expect(codes(await list("paymentStatus=partially_paid"))).toEqual([
			"ECL-5",
		]);
		expect(codes(await list("paymentStatus=unpaid"))).toEqual([
			"ECL-2",
			"ECL-1",
		]);
		expect(codes(await list("paymentStatus=nothing_due"))).toEqual(["ECL-4"]);
		expect(codes(await list("status=delivered&paymentStatus=paid"))).toEqual([
			"ECL-3",
		]);
		const none = await list("status=pending&channel=in_person");
		expect(none).toMatchObject({ items: [], total: 0, pageCount: 1 });
	});

	test("filters by the days of the store, not of UTC", async () => {
		// ECL-2 was placed on October 2 in UTC but on the evening of October 1 in the store.
		expect(codes(await list("from=2026-10-02&to=2026-10-03"))).toEqual([
			"ECL-3",
		]);
		expect(codes(await list("to=2026-10-01&sort=code&dir=asc"))).toEqual([
			"ECL-1",
			"ECL-2",
		]);
		expect(codes(await list("from=2026-10-04"))).toEqual(["ECL-5", "ECL-4"]);
	});

	test("searches the code, the name of the customer and the phone", async () => {
		expect(codes(await list("q=ecl-3"))).toEqual(["ECL-3"]);
		expect(codes(await list("q=ANA&sort=code&dir=asc"))).toEqual([
			"ECL-1",
			"ECL-4",
		]);
		expect(codes(await list("q=perez"))).toEqual(["ECL-1"]);
		expect(codes(await list("q=7123-4567"))).toEqual(["ECL-1"]);
		expect(codes(await list("q=ana&status=cancelled"))).toEqual(["ECL-4"]);
	});

	test("refuses an unknown sort, a page size it does not offer and a backwards range", async () => {
		for (const query of [
			"sort=password",
			"dir=sideways",
			"pageSize=7",
			"page=0",
			"status=lost",
			"paymentStatus=maybe",
			"from=2026-10-05&to=2026-10-01",
			"from=2026-02-31",
		]) {
			const res = await app.request(`/orders?${query}`);
			expect(res.status).toBe(400);
			expect(await res.json()).toMatchObject({ error: "invalid_request" });
		}
	});
});
