import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase, orderSql } from "#/db/test-database";
import { addDays, storeToday, toDbTimestamp } from "#/lib/dates";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { dashboardRouter } = await import("./dashboard");
const { reportsRouter } = await import("./reports");

const app = new Hono<AdminEnv>()
	.use(async (c, next) => {
		c.set("adminUserId", "admin");
		await next();
	})
	.route("/dashboard", dashboardRouter)
	.route("/reports", reportsRouter);

const TIME_ZONE = "America/El_Salvador";
const today = storeToday(TIME_ZONE);
// Midday in El Salvador (UTC-6, no daylight saving) on a local day.
const noon = (day: string) => `${day}T18:00:00Z`;

type Day = {
	day: string;
	orders: number;
	revenue: number;
	grossProfit: number;
};
type Dashboard = {
	from: string;
	to: string;
	days: number;
	sales: {
		orders: number;
		units: number;
		revenue: number;
		merchandise: number;
		grossProfit: number;
		margin: number | null;
	};
	bookings: { orders: number; value: number };
	losses: Record<string, unknown>;
	pendingOrders: number;
	overduePendingOrders: number;
	newCustomers: number;
	followups: { counts: Record<string, number>; items: unknown[] };
	pendingReviews: number;
	pendingStockAlerts: number;
	byDay: Day[];
	topProducts: { sku: string; units: number; merchandise: number }[];
	stock: { lowStock: number; onHand: number; value: number };
};
const lastDays = (days: number) =>
	`from=${addDays(today, -(days - 1))}&to=${today}`;
const dashboard = async (query = ""): Promise<Dashboard> => {
	const res = await app.request(`/dashboard${query ? `?${query}` : ""}`);
	expect(res.status).toBe(200);
	return (await res.json()) as Dashboard;
};

let db: Database;
let nextOrder = 0;

// [id, price] by SKU. Only OIL has stock from the start.
const SIZES = {
	"OIL-001": [1, 1500],
	"SKB-001": [3, 1000],
	"SKC-001": [4, 900],
	"SKD-001": [5, 800],
	"SKE-001": [6, 700],
	"SKF-001": [7, 600],
} as const;
type Sku = keyof typeof SIZES;

function sale(day: string, units = 1, sku: Sku = "OIL-001", shipping = 0) {
	const [variantId, price] = SIZES[sku];
	const id = ++nextOrder;
	db.exec(
		orderSql({
			id,
			code: `E-${id}`,
			status: "shipped",
			shipping,
			createdAt: noon(day),
			paidAt: noon(day),
			shippedAt: noon(day),
			lines: [{ variantId, quantity: units, unitPrice: price, sku }],
		}),
	);
}

// Ten units of the other sizes, so orders for them can be placed.
function stockOtherSizes() {
	for (const sku of [
		"SKB-001",
		"SKC-001",
		"SKD-001",
		"SKE-001",
		"SKF-001",
	] as const) {
		const [variantId, price] = SIZES[sku];
		db.exec(`
insert into variants (id, product_id, sku, price, search_key) values (${variantId}, 1, '${sku}', ${price}, '${sku}');
insert into purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) values (1, ${variantId}, 10, 500);
insert into purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) values (1, last_insert_rowid(), 10, 0);
insert into lots (variant_id, receipt_line_id, unit_cost_e4) values (${variantId}, last_insert_rowid(), 50000);
insert into inventory_movements (lot_id, kind, quantity, created_by) values (last_insert_rowid(), 'receive', 10, 'u');
`);
	}
}

function pending(createdAt: string) {
	const id = ++nextOrder;
	db.exec(
		orderSql({
			id,
			code: `E-${id}`,
			createdAt,
			lines: [{ variantId: 1, quantity: 1, unitPrice: 1500, sku: "OIL-001" }],
		}),
	);
}

beforeEach(() => {
	nextOrder = 0;
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, low_stock_threshold, followup_pending_payment_hours) values (1, 'Store', 'USD', 'es', '${TIME_ZONE}', 'SV', 'ECL', 20, 5, 48);
insert into brands (slug, name, search_key) values ('skin1004', 'SKIN1004', 'skin1004');
insert into categories (slug, icon, sort_order) values ('cleanser', 'package', 1);
insert into products (slug, brand_id, category_id) values ('oil', 1, 1);
insert into variants (product_id, sku, price, reorder_point, search_key) values (1, 'OIL-001', 1500, 10, 'oil');
insert into variants (product_id, sku, price, search_key) values (1, 'OIL-002', 2500, 'oil 2');
insert into suppliers (name, search_key) values ('Supplier', 'supplier');
insert into purchase_orders (supplier_id, reference, status, ordered_on) values (1, 'PO-1', 'ordered', '2026-01-01');
insert into purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) values (1, 1, 50, 700);
insert into purchase_receipts (purchase_order_id, received_on, created_by) values (1, '2026-01-02', 'u');
insert into purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) values (1, 1, 50, 0);
insert into lots (variant_id, receipt_line_id, unit_cost_e4) values (1, 1, 70000);
insert into inventory_movements (lot_id, kind, quantity, created_by) values (1, 'receive', 50, 'u');
`);
	env.DB = d1(db);
});

describe("GET /dashboard", () => {
	test("sums up the last thirty days, today included, one entry per day", async () => {
		const d = await dashboard();
		expect(d.days).toBe(30);
		expect(d.from).toBe(addDays(today, -29));
		expect(d.to).toBe(today);
		expect(d.byDay).toHaveLength(30);
		expect(d.byDay[0].day).toBe(d.from);
		expect(d.byDay[29].day).toBe(today);
		d.byDay.forEach((entry, n) => {
			expect(entry.day).toBe(addDays(d.from, n));
		});
	});

	test("a window with no sales is zero for every day, with no margin", async () => {
		const d = await dashboard(lastDays(7));
		expect(d.days).toBe(7);
		expect(d.from).toBe(addDays(today, -6));
		expect(d.byDay).toHaveLength(7);
		expect(
			d.byDay.every((x) => x.orders + x.revenue + x.grossProfit === 0),
		).toBe(true);
		expect(d.sales).toMatchObject({
			orders: 0,
			units: 0,
			revenue: 0,
			grossProfit: 0,
			margin: null,
		});
		expect(d.topProducts).toEqual([]);
		expect(d.bookings).toEqual({ orders: 0, value: 0 });
	});

	test("puts each sale on the local day it was shipped", async () => {
		sale(today, 2, "OIL-001", 300);
		sale(addDays(today, -2), 1);
		const d = await dashboard();
		const byDay = new Map(d.byDay.map((x) => [x.day, x]));
		// Revenue is what the order owes: the merchandise and the shipping fee.
		expect(byDay.get(today)).toMatchObject({ orders: 1, revenue: 3300 });
		expect(byDay.get(addDays(today, -1))).toMatchObject({
			orders: 0,
			revenue: 0,
		});
		expect(byDay.get(addDays(today, -2))).toMatchObject({
			orders: 1,
			revenue: 1500,
		});
		expect(d.sales).toMatchObject({
			orders: 2,
			units: 3,
			revenue: 4800,
			merchandise: 4500,
			shipping: 300,
		});
	});

	test("a window leaves out the sales before it", async () => {
		sale(today);
		sale(addDays(today, -40));
		expect((await dashboard(lastDays(30))).sales.orders).toBe(1);
		expect((await dashboard(lastDays(90))).sales.orders).toBe(2);
		expect((await dashboard(lastDays(7))).byDay).toHaveLength(7);
	});

	test("lists the best sellers with the units and the merchandise sold", async () => {
		sale(today, 3);
		expect((await dashboard()).topProducts).toMatchObject([
			{ sku: "OIL-001", units: 3, merchandise: 4500 },
		]);
	});

	test("lists the five best sellers, the most merchandise first", async () => {
		stockOtherSizes();
		sale(today, 1, "SKF-001"); // 600
		sale(today, 1, "SKE-001"); // 700
		sale(today, 1, "SKD-001"); // 800
		sale(today, 1, "SKC-001"); // 900
		sale(today, 1, "SKB-001"); // 1000
		sale(today, 1, "OIL-001"); // 1500
		expect((await dashboard()).topProducts.map((p) => p.sku)).toEqual([
			"OIL-001",
			"SKB-001",
			"SKC-001",
			"SKD-001",
			"SKE-001",
		]);
	});

	test("counts the orders waiting for payment and the ones past the payment deadline", async () => {
		pending(toDbTimestamp(new Date()));
		pending(noon(addDays(today, -3)));
		const d = await dashboard();
		expect(d.pendingOrders).toBe(2);
		expect(d.overduePendingOrders).toBe(1);
		expect(d.followups.counts).toEqual({
			collect_payment: 1,
			ship: 0,
			confirm_delivery: 0,
		});
		expect(d.followups.items).toHaveLength(1);
	});

	test("books the orders placed in the window at what they owe", async () => {
		sale(today, 2);
		sale(addDays(today, -40));
		expect((await dashboard()).bookings).toEqual({ orders: 1, value: 3000 });
	});

	test("counts the variants at or below their reorder point, or the store's threshold without one", async () => {
		// 50 units on hand against a point of 10: fine. The second variant has none against
		// the threshold of 5: low. Writing off 41 leaves 9.
		expect((await dashboard()).stock.lowStock).toBe(1);
		db.exec(
			"insert into inventory_movements (lot_id, kind, quantity, reason, created_by) values (1, 'waste', -41, 'damaged', 'u')",
		);
		const d = await dashboard();
		expect(d.stock.onHand).toBe(9);
		expect(d.stock.lowStock).toBe(2);
	});

	test("reports the losses of the window: units written off at their lot cost", async () => {
		const waste = (units: number, day: string) =>
			db.exec(
				`insert into inventory_movements (lot_id, kind, quantity, reason, created_by, created_at) values (1, 'waste', -${units}, 'damaged', 'u', '${noon(day)}')`,
			);
		waste(10, today);
		waste(4, addDays(today, -5));
		waste(2, addDays(today, -40));
		expect((await dashboard()).losses).toMatchObject({
			writeOffs: { units: 14, cost: 9800 },
			totalLoss: 9800,
		});
		expect((await dashboard(lastDays(90))).losses).toMatchObject({
			writeOffs: { units: 16, cost: 11200 },
		});
	});

	test("does not count an archived variant below its reorder point", async () => {
		db.exec(`
insert into purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) values (1, 2, 5, 700);
insert into purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) values (1, last_insert_rowid(), 5, 0);
insert into lots (variant_id, receipt_line_id, unit_cost_e4) values (2, last_insert_rowid(), 70000);
insert into inventory_movements (lot_id, kind, quantity, created_by) values (last_insert_rowid(), 'receive', 5, 'u');
update variants set reorder_point = 10 where id = 2;
`);
		expect((await dashboard()).stock.lowStock).toBe(1);
		db.exec("update variants set status = 'archived' where id = 2");
		expect((await dashboard()).stock.lowStock).toBe(0);
	});

	test("counts a customer as new in the window of their first purchase", async () => {
		db.exec(
			"insert into customers (id, name, email, search_key) values (1, 'Ana', 'ana@example.com', 'ana')",
		);
		sale(addDays(today, -40));
		sale(today);
		db.exec("update orders set customer_id = 1");
		expect((await dashboard()).newCustomers).toBe(0);
		expect((await dashboard(lastDays(90))).newCustomers).toBe(1);
		expect((await dashboard(`from=${today}&to=${today}`)).days).toBe(1);
	});

	test("refuses a range that is reversed, half given or too long", async () => {
		for (const query of [
			`from=${today}`,
			`from=${today}&to=${addDays(today, -1)}`,
			`from=${addDays(today, -1096)}&to=${today}`,
		])
			expect((await app.request(`/dashboard?${query}`)).status).toBe(400);
		expect(
			(
				await app.request(
					`/dashboard?from=${addDays(today, -1095)}&to=${today}`,
				)
			).status,
		).toBe(200);
	});
});

describe("the dashboard and the reports of the same days", () => {
	test("the figures are the reports', and the days add up to the total", async () => {
		sale(today, 2, "OIL-001", 300);
		sale(addDays(today, -2), 1);
		sale(addDays(today, -9), 4);
		const d = await dashboard();
		const range = `from=${d.from}&to=${d.to}`;
		const sales = (await (
			await app.request(`/reports/sales?${range}&granularity=day`)
		).json()) as {
			totals: Dashboard["sales"];
			periods: (Day & { period: string })[];
		};
		expect(d.sales).toEqual(sales.totals);
		expect(d.byDay).toEqual(
			sales.periods.map((p) => ({
				day: p.period,
				orders: p.orders,
				revenue: p.revenue,
				grossProfit: p.grossProfit,
			})),
		);
		expect(d.byDay.reduce((n, x) => n + x.revenue, 0)).toBe(d.sales.revenue);
		expect(d.byDay.reduce((n, x) => n + x.orders, 0)).toBe(d.sales.orders);

		const products = (await (
			await app.request(`/reports/products?${range}`)
		).json()) as { products: Dashboard["topProducts"] };
		expect(products.products.slice(0, 5)).toMatchObject(d.topProducts);

		const stock = (await (
			await app.request(`/reports/stock?${range}`)
		).json()) as {
			totals: Record<string, number>;
		};
		expect(stock.totals).toMatchObject({
			onHand: d.stock.onHand,
			value: d.stock.value,
			lowStock: d.stock.lowStock,
		});

		const {
			from: _from,
			to: _to,
			...losses
		} = (await (
			await app.request(`/reports/losses?${range}`)
		).json()) as Record<string, unknown>;
		expect(d.losses).toEqual(losses);
	});
});
