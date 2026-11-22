import type { Database } from "bun:sqlite";
import { beforeEach, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase, orderSql } from "#/db/test-database";
import type { AdminEnv } from "#/server/auth";

const env: { DB?: ReturnType<typeof d1>; BETTER_AUTH_URL: string } = {
	BETTER_AUTH_URL: "http://localhost",
};
mock.module("cloudflare:workers", () => ({ env }));
const { followupsRouter } = await import("./followups");

const app = new Hono<AdminEnv>().route("/followups", followupsRouter);

let db: Database;
beforeEach(() => {
	db = migratedDatabase();
	db.exec(`
insert into store_settings (id, name, currency, default_locale, followup_pending_payment_hours, followup_paid_unshipped_hours, followup_shipped_undelivered_hours) values (1, 'Nagomi', 'USD', 'es', 48, 24, 96);
insert into customers (id, name, email, search_key) values (1, 'Ana', 'ana@example.com', 'ana');
`);
	const ago = (hours: number) =>
		new Date(Date.now() - hours * 3_600_000)
			.toISOString()
			.replace(/\.\d{3}Z$/, "Z");
	const line = [{ variantId: 1, quantity: 1, unitPrice: 0 }];
	db.exec(`
insert into brands (slug, name, search_key) values ('b', 'Brand', 'b');
insert into categories (slug, icon, sort_order) values ('c', 'package', 1);
insert into products (slug, brand_id, category_id) values ('p', 1, 1);
insert into variants (product_id, sku, search_key) values (1, 'SKU-1', 's');
${orderSql({ id: 1, code: "NAG-1", customerId: 1, name: "Ana", email: "ana@example.com", createdAt: ago(72), lines: line, takeStock: false })}
${orderSql({ id: 2, code: "NAG-2", name: "Beto", email: "beto@example.com", createdAt: ago(50), lines: line, takeStock: false })}
${orderSql({ id: 3, code: "NAG-3", name: "Carla", createdAt: ago(2), lines: line, takeStock: false })}
`);
	env.DB = d1(db);
});

type Followup = {
	code: string;
	customerName: string;
	customerEmail: string | null;
	status: string;
	deadlineHours: number;
	hoursOverdue: number;
};

test("lists the orders past their follow-up deadline, the most overdue first", async () => {
	const res = await app.request("/followups");
	expect(res.status).toBe(200);
	const { orders } = (await res.json()) as { orders: Followup[] };
	expect(
		orders.map((o) => [
			o.code,
			o.customerName,
			o.customerEmail,
			o.status,
			o.deadlineHours,
		]),
	).toEqual([
		["NAG-1", "Ana", "ana@example.com", "pending", 48],
		["NAG-2", "Beto", "beto@example.com", "pending", 48],
	]);
	expect(Math.round(orders[0].hoursOverdue)).toBe(24);
});

test("the deadlines come from the settings", async () => {
	db.exec("update store_settings set followup_pending_payment_hours = 60");
	const { orders } = (await (await app.request("/followups")).json()) as {
		orders: Followup[];
	};
	expect(orders.map((o) => o.code)).toEqual(["NAG-1"]);
});
