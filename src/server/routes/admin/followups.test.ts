import type { Database } from "bun:sqlite";
import { beforeEach, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
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
insert into orders (id, code, idempotency_key, request_hash, customer_id, customer_name, search_key, locale, channel, subtotal, total, created_at) values (1, 'NAG-1', 'k1', 'h', 1, 'Ana', 'x', 'es', 'whatsapp', 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-72 hours')), (2, 'NAG-2', 'k2', 'h', null, 'Beto', 'x', 'es', 'whatsapp', 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 hours')), (3, 'NAG-3', 'k3', 'h', null, 'Carla', 'x', 'es', 'whatsapp', 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours'));
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
		["NAG-2", "Beto", null, "pending", 48],
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
