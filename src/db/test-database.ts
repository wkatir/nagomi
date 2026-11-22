import { Database, type SQLQueryBindings } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Every migration in journal order, with foreign keys on as D1 runs them.
const dir = join(import.meta.dir, "../../drizzle");
const journal = JSON.parse(
	readFileSync(join(dir, "meta/_journal.json"), "utf8"),
) as { entries: { tag: string }[] };
export const migrations = journal.entries.map((e) =>
	readFileSync(join(dir, `${e.tag}.sql`), "utf8"),
);

export function migratedDatabase() {
	const db = new Database(":memory:");
	db.exec("PRAGMA foreign_keys = ON");
	for (const file of migrations)
		for (const statement of file.split("--> statement-breakpoint"))
			if (statement.trim()) db.exec(statement);
	return db;
}

// The part of D1 that drizzle-orm/d1 calls.
export function d1(db: Database) {
	const statement = (sql: string, params: SQLQueryBindings[] = []) => {
		const execute = () => {
			const results = db.prepare(sql).all(...params);
			const { changes } = db.prepare("select changes() as changes").get() as {
				changes: number;
			};
			return { results, meta: { changes }, success: true };
		};
		return {
			execute,
			bind: (...values: SQLQueryBindings[]) => statement(sql, values),
			all: async () => execute(),
			run: async () => execute(),
			raw: async () => db.prepare(sql).values(...params),
		};
	};
	return {
		prepare: (sql: string) => statement(sql),
		// D1 runs a batch as one transaction: a failing statement rolls back the rest.
		batch: async (statements: ReturnType<typeof statement>[]) =>
			db.transaction(() => statements.map((s) => s.execute()))(),
	};
}

export type TestOrderLine = {
	variantId: number;
	quantity: number;
	unitPrice: number;
	sku?: string;
	// The lot the units leave; the variant's first lot when omitted.
	lotId?: number;
};

export type TestOrder = {
	id: number;
	code?: string;
	customerId?: number | null;
	name?: string;
	email?: string;
	phone?: string;
	channel?: string;
	locale?: string;
	status?: "pending" | "paid" | "shipped" | "delivered" | "cancelled";
	// Cancelled from pending unless paid first.
	cancelledFrom?: "pending" | "paid";
	method?:
		| "card"
		| "bank_transfer"
		| "cash_on_delivery"
		| "payment_link"
		| "cash";
	createdAt?: string;
	paidAt?: string;
	shippedAt?: string;
	deliveredAt?: string;
	cancelledAt?: string;
	lines: TestOrderLine[];
	discount?: number;
	discountReason?: string | null;
	promotionId?: number | null;
	shipping?: number;
	notes?: string | null;
	searchKey?: string;
	// false leaves the order without sale movements.
	takeStock?: boolean;
};

const q = (v: string | number | null | undefined) =>
	v === null || v === undefined
		? "NULL"
		: typeof v === "number"
			? String(v)
			: `'${v.replaceAll("'", "''")}'`;

// Places the order as checkout does and walks it through the statuses so every trigger passes.
export function orderSql(o: TestOrder): string {
	const status = o.status ?? "pending";
	const method = o.method ?? "bank_transfer";
	const subtotal = o.lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0);
	const discount = o.discount ?? 0;
	const shipping = o.shipping ?? 0;
	const total = subtotal - discount + shipping;
	const created = o.createdAt ?? "2026-10-01T15:00:00Z";
	const code = o.code ?? `NAG-${String(o.id).padStart(6, "0")}`;
	const out = [
		`insert into orders (id, code, idempotency_key, request_hash, customer_id, customer_name, customer_email, customer_phone, search_key, locale, channel, status, payment_method, subtotal, discount, discount_reason, shipping, total, shipping_method, confirmation_message, notes, created_at, promotion_id) values (${o.id}, ${q(code)}, 'k${o.id}', 'h', ${q(o.customerId ?? null)}, ${q(o.name ?? "Cliente")}, ${q(o.email ?? `cliente${o.id}@example.com`)}, ${q(o.phone ?? "+50371234567")}, ${q(o.searchKey ?? code.toLowerCase())}, ${q(o.locale ?? "es")}, ${q(o.channel ?? "web")}, 'pending', ${q(method)}, ${subtotal}, ${discount}, ${q(o.discountReason ?? (discount > 0 ? "CODE" : null))}, ${shipping}, ${total}, 'pickup', 'm', ${q(o.notes ?? null)}, ${q(created)}, ${q(o.promotionId ?? null)});`,
	];
	o.lines.forEach((l, i) => {
		out.push(
			`insert into order_items (order_id, variant_id, quantity, unit_price, sku, brand_name, product_name) values (${o.id}, ${l.variantId}, ${l.quantity}, ${l.unitPrice}, ${q(l.sku ?? `SKU-${l.variantId}`)}, 'Brand', 'Product ${i + 1}');`,
		);
		if (o.takeStock !== false)
			out.push(
				`insert into inventory_movements (lot_id, kind, quantity, order_item_id, created_at, created_by) values (${l.lotId ?? `(select min(id) from lots where variant_id = ${l.variantId})`}, 'sale', ${-l.quantity}, (select id from order_items where order_id = ${o.id} and variant_id = ${l.variantId} and order_bundle_id is null), ${q(created)}, 'test');`,
			);
	});
	const paidAt = o.paidAt ?? created.replace(/T\d\d/, "T16");
	const shippedAt = o.shippedAt ?? created.replace(/T\d\d/, "T17");
	const deliveredAt = o.deliveredAt ?? created.replace(/T\d\d/, "T18");
	const cancelledAt = o.cancelledAt ?? created.replace(/T\d\d/, "T19");
	const pay = (at: string) =>
		total > 0
			? out.push(
					`insert into payments (order_id, kind, method, amount, status, recorded_at, recorded_by) values (${o.id}, 'payment', ${q(method)}, ${total}, 'confirmed', ${q(at)}, 'test');`,
				)
			: 0;
	const set = (from: string, fields: string) =>
		out.push(
			`update orders set ${fields} where id = ${o.id} and status = '${from}';`,
		);
	const cod = method === "cash_on_delivery";
	if (status === "pending") return out.join("\n");
	if (status === "cancelled") {
		if (o.cancelledFrom === "paid") {
			pay(paidAt);
			set("pending", `status = 'paid', paid_at = ${q(paidAt)}`);
		}
		set(
			o.cancelledFrom ?? "pending",
			`status = 'cancelled', cancelled_at = ${q(cancelledAt)}, cancel_reason = 'test'`,
		);
		return out.join("\n");
	}
	if (!cod) {
		pay(paidAt);
		set("pending", `status = 'paid', paid_at = ${q(paidAt)}`);
	}
	if (status === "paid") return out.join("\n");
	set(
		cod ? "pending" : "paid",
		`status = 'shipped', shipped_at = ${q(shippedAt)}, courier = 'Reparto'`,
	);
	if (status === "shipped") return out.join("\n");
	if (cod) pay(deliveredAt);
	set("shipped", `status = 'delivered', delivered_at = ${q(deliveredAt)}`);
	return out.join("\n");
}
