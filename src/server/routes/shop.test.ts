import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { d1, migratedDatabase } from "#/db/test-database";
import { hmacSha256Hex } from "../payments/wompi";

let session: { user: { id: string; role?: string } } | null = null;
const env: Record<string, unknown> & { DB?: ReturnType<typeof d1> } = {
	BETTER_AUTH_URL: "https://nagomi.example",
	BETTER_AUTH_SECRET: "a-test-secret-that-is-long-enough-123",
	ORDER_LIMITER: { limit: async () => ({ success: true }) },
};
mock.module("cloudflare:workers", () => ({ env }));
mock.module("#/lib/auth", () => ({
	auth: { api: { getSession: async () => session } },
	authMethods: { google: false, password: true },
}));
const { apiError } = await import("../api-error");
const { shop } = await import("./shop");

const app = new Hono().route("/", shop).onError(apiError);

let db: Database;
let jar: Map<string, string>;

async function send(
	method: string,
	path: string,
	body?: unknown,
	headers: Record<string, string> = {},
) {
	const res = await app.request(path, {
		method,
		headers: {
			"content-type": "application/json",
			"cf-connecting-ip": "203.0.113.7",
			cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
			...headers,
		},
		body:
			body === undefined
				? undefined
				: typeof body === "string"
					? body
					: JSON.stringify(body),
	});
	for (const cookie of res.headers.getSetCookie()) {
		const [pair] = cookie.split(";");
		const at = pair.indexOf("=");
		jar.set(pair.slice(0, at), pair.slice(at + 1));
	}
	return res;
}
const json = async <T = Record<string, unknown>>(res: Response) =>
	(await res.json()) as T;

type Cart = {
	lines: {
		id: number;
		sku: string | null;
		quantity: number;
		maxQuantity: number;
		problem: string | null;
		unitPrice: number;
	}[];
	count: number;
	subtotal: number;
	discount: number;
	shipping: number | null;
	total: number;
	taxIncluded: number;
	coupon: { code: string; valid: boolean } | null;
	shippingQuote: { zone: string; fee: number } | null;
	paymentOptions: {
		method: string;
		available: boolean;
		reason: string | null;
	}[];
};

const q = "?locale=es";
const add = (item: { sku?: string; bundle?: string; quantity: number }) =>
	send("POST", `/cart/items${q}`, item);
const cart = async (municipality?: string) =>
	json<Cart>(
		await send(
			"GET",
			`/cart${q}${municipality ? `&municipality=${encodeURIComponent(municipality)}` : ""}`,
		),
	);
const onHand = (variant: number) =>
	(
		db
			.query(
				`select coalesce(sum(m.quantity), 0) as n from inventory_movements m join lots l on l.id = m.lot_id where l.variant_id = ${variant}`,
			)
			.get() as { n: number }
	).n;

const guest = {
	locale: "es",
	name: "Ana Pérez",
	email: "Ana@Example.com",
	phone: "+503 7123-4567",
	delivery: {
		department: "San Salvador",
		municipality: "San Salvador Centro",
		addressLine: "Colonia Escalón, casa 12",
		reference: "Portón negro",
	},
	paymentMethod: "bank_transfer",
	consents: {
		privacyNotice: true,
		terms: true,
		marketingEmail: false,
		marketingWhatsapp: true,
	},
};
const checkout = (overrides: Record<string, unknown> = {}) =>
	send("POST", "/checkout", {
		idempotencyKey: crypto.randomUUID(),
		...guest,
		...overrides,
	});

beforeEach(() => {
	db = migratedDatabase();
	jar = new Map();
	session = null;
	delete env.WOMPI_CLIENT_ID;
	delete env.WOMPI_CLIENT_SECRET;
	db.exec(`
insert into store_settings (id, name, currency, default_locale, legal_name, tax_id_label, tax_id, address, email, time_zone, country_code, order_code_prefix, max_quantity_per_line, low_stock_threshold, free_shipping_from, tax_rate_bp, followup_pending_payment_hours, bank_name, bank_account_type, bank_account_number, bank_account_holder) values (1, 'Nagomi', 'USD', 'es', 'Nagomi S.A. de C.V.', 'NIT', '0614-010101-101-1', 'San Salvador', 'hola@nagomi.example', 'America/El_Salvador', 'SV', 'NAG', 10, 5, 5000, 1300, 48, 'Banco Agrícola', 'Cuenta corriente', '123-456789-0', 'Nagomi S.A. de C.V.');
insert into pages (slug, is_published) values ('privacy', 1), ('terms', 1);
insert into page_versions (page_id, locale, version, title, body_markdown) values (1, 'es', 1, 'Aviso', 'Texto'), (2, 'es', 1, 'Términos', 'Texto');
insert into shipping_zones (id, slug, method, fee, covers_rest, delivery_days_min, delivery_days_max) values (1, 'metro', 'own_delivery', 350, 0, 1, 2), (2, 'national', 'courier', 500, 1, 2, 4);
insert into shipping_zone_translations (zone_id, locale, name) values (1, 'es', 'San Salvador'), (2, 'es', 'Resto del país');
insert into shipping_zone_municipalities (municipality, zone_id) values ('San Salvador Centro', 1);
insert into store_payment_methods (method, position, max_total, shipping_zone_id) values ('card', 1, null, null), ('bank_transfer', 2, null, null), ('cash_on_delivery', 3, 15000, 1);
insert into brands (slug, name, search_key) values ('rk', 'Royal Kludge', 'rk');
insert into categories (slug, icon, sort_order) values ('teclados', 'keyboard', 1);
insert into category_translations (category_id, locale, name) values (1, 'es', 'Teclados');
insert into products (slug, brand_id, category_id) values ('rk75', 1, 1), ('hana', 1, 1), ('mat', 1, 1);
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Teclado RK75', 'rk75'), (2, 'es', 'Mouse Hana', 'hana'), (3, 'es', 'Alfombrilla', 'mat');
insert into variants (product_id, sku, price, search_key) values (1, 'TEC-001', 8999, 'tec'), (2, 'RAT-002', 2499, 'rat'), (3, 'ALF-001', 1000, 'alf');
update products set status = 'published';
insert into bundles (slug, price) values ('set', 10499);
insert into bundle_translations (bundle_id, locale, name) values (1, 'es', 'Set RK');
insert into bundle_items (bundle_id, variant_id, quantity, position) values (1, 1, 1, 1), (1, 2, 1, 2);
update bundles set status = 'published';
insert into suppliers (name, search_key) values ('s', 's');
insert into purchase_orders (supplier_id, reference, status, ordered_on) values (1, 'PO-1', 'ordered', '2026-01-01');
insert into purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) values (1, 1, 3, 5000), (1, 2, 5, 1000), (1, 3, 20, 500);
insert into purchase_receipts (purchase_order_id, received_on, created_by) values (1, '2026-01-02', 'u');
insert into purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) values (1, 1, 3, 0), (1, 2, 5, 0), (1, 3, 20, 0);
insert into lots (variant_id, receipt_line_id, unit_cost_e4) values (1, 1, 500000), (2, 2, 100000), (3, 3, 50000);
insert into inventory_movements (lot_id, kind, quantity, created_by) values (1, 'receive', 3, 'u'), (2, 'receive', 5, 'u'), (3, 'receive', 20, 'u');
insert into promotions (code, type, value, min_subtotal, starts_on, ends_on, per_customer_limit, first_order_only, status) values
	('BIENVENIDA10', 'percentage', 10, null, null, null, 1, 1, 'active'),
	('SETUP15', 'percentage', 15, 8000, '2026-01-01', '2099-12-31', null, 0, 'active'),
	('VIEJO', 'percentage', 20, null, '2020-01-01', '2020-12-31', null, 0, 'active');
insert into promotion_translations (promotion_id, locale, description) values (1, 'es', '10 %'), (2, 'es', '15 %'), (3, 'es', '20 %');
`);
	env.DB = d1(db);
});

afterEach(() => {
	mock.restore();
});

describe("cart", () => {
	test("lives on the server behind an httpOnly cookie and is priced there", async () => {
		const res = await add({ sku: "RAT-002", quantity: 2 });
		expect(res.status).toBe(200);
		expect(res.headers.getSetCookie()[0]).toMatch(
			/nagomi_cart=[0-9a-f]{32}; .*HttpOnly/i,
		);
		const priced = await cart();
		expect(priced.lines.map((l) => [l.sku, l.quantity, l.unitPrice])).toEqual([
			["RAT-002", 2, 2499],
		]);
		expect(priced.subtotal).toBe(4998);
		expect(priced.shipping).toBeNull();
		expect(priced.total).toBe(4998);
	});

	test("adds up a size added twice, capped at the units left", async () => {
		await add({ sku: "TEC-001", quantity: 2 });
		await add({ sku: "TEC-001", quantity: 2 });
		const priced = await cart();
		expect(priced.lines[0]).toMatchObject({ quantity: 3, maxQuantity: 3 });
		const refused = await add({ sku: "TEC-001", quantity: 1 });
		expect(refused.status).toBe(409);
		expect(await json(refused)).toMatchObject({
			error: "out_of_stock",
			available: 3,
		});
	});

	test("a set is one line at the set's price and counts its items' stock", async () => {
		await add({ sku: "TEC-001", quantity: 2 });
		await add({ bundle: "set", quantity: 1 });
		const priced = await cart();
		const set = priced.lines.find((l) => l.sku === null);
		expect(set).toMatchObject({
			unitPrice: 10499,
			quantity: 1,
			maxQuantity: 1,
		});
		expect(priced.subtotal).toBe(2 * 8999 + 10499);
		expect((await add({ bundle: "set", quantity: 1 })).status).toBe(409);
	});

	test("shipping follows the municipality, free from the store's amount, and the IVA is included", async () => {
		await add({ sku: "RAT-002", quantity: 1 });
		const metro = await cart("San Salvador Centro");
		expect(metro.shippingQuote).toMatchObject({ zone: "metro", fee: 350 });
		expect(metro.total).toBe(2499 + 350);
		expect(metro.taxIncluded).toBe(
			Math.floor((2 * 2849 * 1300 + 11300) / (2 * 11300)),
		);
		const rest = await cart("Santa Ana Centro");
		expect(rest.shippingQuote).toMatchObject({ zone: "national", fee: 500 });
		await add({ sku: "ALF-001", quantity: 3 });
		expect((await cart("San Salvador Centro")).shipping).toBe(0);
	});

	test("a line can be changed and removed, and the cart emptied", async () => {
		await add({ sku: "RAT-002", quantity: 1 });
		await add({ sku: "ALF-001", quantity: 1 });
		const [first] = (await cart()).lines;
		await send("PATCH", `/cart/items/${first.id}${q}`, { quantity: 4 });
		expect((await cart()).lines[0].quantity).toBe(4);
		await send("DELETE", `/cart/items/${first.id}${q}`);
		expect((await cart()).lines.map((l) => l.sku)).toEqual(["ALF-001"]);
		await send("DELETE", `/cart${q}`);
		expect((await cart()).count).toBe(0);
	});

	test("a coupon applies only when its rules hold, and its discount is the code's", async () => {
		await add({ sku: "RAT-002", quantity: 1 });
		const low = await send("PUT", `/cart/coupon${q}`, { code: "setup15" });
		expect(low.status).toBe(422);
		expect(await json(low)).toMatchObject({
			reason: "min_subtotal_not_met",
			minSubtotal: 8000,
		});
		expect(
			await json(await send("PUT", `/cart/coupon${q}`, { code: "VIEJO" })),
		).toMatchObject({
			reason: "expired",
		});
		await add({ sku: "TEC-001", quantity: 1 });
		const applied = await json<Cart>(
			await send("PUT", `/cart/coupon${q}`, { code: "setup15" }),
		);
		expect(applied.coupon).toMatchObject({ code: "SETUP15", valid: true });
		expect(applied.discount).toBe(Math.floor(((8999 + 2499) * 15 + 50) / 100));
		await send("DELETE", `/cart/coupon${q}`);
		expect((await cart()).discount).toBe(0);
	});

	test("a guest cart is merged into the customer's at sign-in, capped at what is left", async () => {
		db.exec(`
insert into users (id, name, email, role) values ('u-ana', 'Ana', 'ana@example.com', 'customer');
insert into customers (id, auth_user_id, name, email, phone_e164, search_key) values (1, 'u-ana', 'Ana', 'ana@example.com', '+50371234567', 'ana');
insert into carts (id, customer_id) values ('${"b".repeat(32)}', 1);
insert into cart_items (cart_id, variant_id, quantity) values ('${"b".repeat(32)}', 1, 2);`);
		await add({ sku: "TEC-001", quantity: 2 });
		await add({ sku: "RAT-002", quantity: 1 });
		const guestCart = jar.get("nagomi_cart");
		session = { user: { id: "u-ana", role: "customer" } };
		const merged = await cart();
		expect(merged.lines.map((l) => [l.sku, l.quantity])).toEqual([
			["TEC-001", 3],
			["RAT-002", 1],
		]);
		expect(jar.get("nagomi_cart")).toBe("b".repeat(32));
		expect(
			db
				.query(`select count(*) as n from carts where id = '${guestCart}'`)
				.get(),
		).toEqual({ n: 0 });
		session = null;
		expect((await cart()).count).toBe(0);
	});
});

describe("checkout", () => {
	test("a guest pays by bank transfer: one order, its units taken, the cart emptied", async () => {
		await add({ sku: "TEC-001", quantity: 1 });
		await add({ sku: "RAT-002", quantity: 2 });
		const res = await checkout();
		expect(res.status).toBe(201);
		const placed = await json<{
			code: string;
			status: string;
			total: number;
			redirectUrl: string | null;
		}>(res);
		expect(placed).toMatchObject({
			status: "pending",
			total: 8999 + 2 * 2499,
			redirectUrl: null,
		});
		expect(onHand(1)).toBe(2);
		expect(onHand(2)).toBe(3);
		expect((await cart()).count).toBe(0);
		const order = db
			.query(
				"select customer_email, customer_phone, channel, shipping, shipping_method, ship_municipality, tax_included, total from orders",
			)
			.get();
		expect(order).toEqual({
			customer_email: "ana@example.com",
			customer_phone: "+50371234567",
			channel: "web",
			shipping: 0,
			shipping_method: "own_delivery",
			ship_municipality: "San Salvador Centro",
			tax_included: Math.floor((2 * 13997 * 1300 + 11300) / (2 * 11300)),
			total: 13997,
		});
		expect(
			db
				.query("select purpose, granted from customer_consents order by id")
				.all(),
		).toEqual([
			{ purpose: "privacy_notice", granted: 1 },
			{ purpose: "terms", granted: 1 },
			{ purpose: "marketing_email", granted: 0 },
			{ purpose: "marketing_whatsapp", granted: 1 },
		]);

		const view = await json<{
			status: string;
			bankTransfer: { accountNumber: string; reference: string } | null;
			history: { to: string }[];
		}>(await send("GET", `/orders/${placed.code}`));
		expect(view.status).toBe("pending");
		expect(view.bankTransfer).toMatchObject({
			accountNumber: "123-456789-0",
			reference: placed.code,
		});
		expect(view.history.map((h) => h.to)).toEqual(["pending"]);
	});

	test("another browser opens the order only with its email", async () => {
		await add({ sku: "RAT-002", quantity: 1 });
		const { code } = await json<{ code: string }>(await checkout());
		jar = new Map();
		expect((await send("GET", `/orders/${code}`)).status).toBe(404);
		expect(
			(await send("GET", `/orders/${code}?email=otra@example.com`)).status,
		).toBe(404);
		expect(
			(await send("GET", `/orders/${code}?email=ANA@example.com`)).status,
		).toBe(200);
	});

	test("a retry with the same key returns the same order", async () => {
		await add({ sku: "RAT-002", quantity: 1 });
		const idempotencyKey = crypto.randomUUID();
		const first = await checkout({ idempotencyKey });
		const again = await checkout({ idempotencyKey });
		expect(first.status).toBe(201);
		expect(again.status).toBe(200);
		expect((await json(again)).code).toBe((await json(first)).code);
		expect(db.query("select count(*) as n from orders").get()).toEqual({
			n: 1,
		});
	});

	test("says what is wrong with each field", async () => {
		await add({ sku: "RAT-002", quantity: 1 });
		const res = await checkout({
			name: "",
			email: "ana@",
			phone: "1234",
			delivery: {
				department: "Santa Ana",
				municipality: "San Salvador Centro",
				addressLine: "",
			},
			consents: { ...guest.consents, terms: false },
		});
		expect(res.status).toBe(422);
		expect((await json(res)).fields).toEqual({
			name: "required",
			email: "invalid",
			phone: "invalid",
			municipality: "unknown",
			addressLine: "required",
			terms: "required",
		});
		expect(db.query("select count(*) as n from orders").get()).toEqual({
			n: 0,
		});
	});

	test("cash on delivery is refused outside its zone and accepted inside it", async () => {
		await add({ sku: "RAT-002", quantity: 1 });
		const outside = await checkout({
			paymentMethod: "cash_on_delivery",
			delivery: {
				department: "Santa Ana",
				municipality: "Santa Ana Centro",
				addressLine: "Barrio El Centro",
			},
		});
		expect(outside.status).toBe(422);
		expect((await json(outside)).fields).toEqual({
			paymentMethod: "outside_zone",
		});
		const inside = await checkout({ paymentMethod: "cash_on_delivery" });
		expect(inside.status).toBe(201);
		expect(await json(inside)).toMatchObject({
			status: "pending",
			paymentMethod: "cash_on_delivery",
		});
	});

	test("the card is shown as unavailable without the Wompi keys", async () => {
		await add({ sku: "RAT-002", quantity: 1 });
		const priced = await cart("San Salvador Centro");
		expect(
			priced.paymentOptions.find((o) => o.method === "card"),
		).toMatchObject({
			available: false,
			reason: "not_configured",
		});
		const res = await checkout({ paymentMethod: "card" });
		expect(res.status).toBe(422);
		expect((await json(res)).fields).toEqual({
			paymentMethod: "not_configured",
		});
	});

	test("the last units go to one order: the other is told what is left", async () => {
		await add({ sku: "TEC-001", quantity: 3 });
		const otherBrowser = new Map<string, string>();
		const mine = jar;
		jar = otherBrowser;
		await add({ sku: "TEC-001", quantity: 2 });
		jar = mine;
		expect((await checkout()).status).toBe(201);
		jar = otherBrowser;
		const late = await checkout({
			email: "beto@example.com",
			phone: "7000 0001",
		});
		expect(late.status).toBe(409);
		expect(await json(late)).toMatchObject({ error: "cart_changed" });
		expect(onHand(1)).toBe(0);
	});

	test("a first-purchase coupon is used once per email, and freed when that order is cancelled", async () => {
		await add({ sku: "RAT-002", quantity: 1 });
		await send("PUT", `/cart/coupon${q}`, { code: "BIENVENIDA10" });
		const first = await checkout();
		expect(first.status).toBe(201);
		expect(db.query("select discount from orders").get()).toEqual({
			discount: 250,
		});
		await add({ sku: "RAT-002", quantity: 1 });
		await send("PUT", `/cart/coupon${q}`, { code: "BIENVENIDA10" });
		const second = await checkout();
		expect(second.status).toBe(409);
		expect(await json(second)).toMatchObject({ error: "promotion_invalid" });
		db.exec(
			"update orders set status = 'cancelled', cancelled_at = '2026-11-01T00:00:00Z' where id = 1",
		);
		expect((await checkout()).status).toBe(201);
	});
});

describe("card payments with Wompi", () => {
	const realFetch = globalThis.fetch;
	beforeEach(() => {
		env.WOMPI_CLIENT_ID = "app-id";
		env.WOMPI_CLIENT_SECRET = "api-secret";
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.endsWith("/connect/token"))
				return Response.json({ access_token: "tok", expires_in: 3600 });
			if (url.endsWith("/EnlacePago"))
				return Response.json({
					idEnlace: 42,
					urlEnlace: "https://lk.wompi.sv/abc",
					estaProductivo: false,
				});
			throw new Error(`Unexpected fetch ${url}`);
		}) as typeof fetch;
	});
	afterEach(() => {
		globalThis.fetch = realFetch;
	});

	const notice = (
		code: string,
		amount: number,
		id = "tx-1",
		result = "ExitosaAprobada",
	) =>
		JSON.stringify({
			IdTransaccion: id,
			ResultadoTransaccion: result,
			Monto: amount / 100,
			EsProductiva: false,
			EnlacePago: { Id: 42, IdentificadorEnlaceComercio: code },
		});
	const webhook = async (body: string, secret = "api-secret") =>
		send("POST", "/payments/wompi/webhook", body, {
			wompi_hash: await hmacSha256Hex(secret, body),
		});

	test("checkout redirects to the payment link; only a signed, approved notice for the exact total pays the order", async () => {
		await add({ sku: "RAT-002", quantity: 1 });
		const res = await checkout({ paymentMethod: "card" });
		const placed = await json<{
			code: string;
			redirectUrl: string;
			total: number;
		}>(res);
		expect(placed.redirectUrl).toBe("https://lk.wompi.sv/abc");
		expect(db.query("select status, reference from payments").get()).toEqual({
			status: "pending",
			reference: "wompi-link:42",
		});

		expect(
			(await webhook(notice(placed.code, placed.total), "wrong")).status,
		).toBe(401);
		expect((await webhook(notice(placed.code, placed.total - 1))).status).toBe(
			409,
		);
		expect(
			await json(
				await webhook(
					notice(placed.code, placed.total, "tx-0", "ExitosaDeclinada"),
				),
			),
		).toMatchObject({ approved: false });
		expect(db.query("select status from orders").get()).toEqual({
			status: "pending",
		});

		expect((await webhook(notice(placed.code, placed.total))).status).toBe(200);
		expect(db.query("select status from orders").get()).toEqual({
			status: "paid",
		});
		expect(
			db.query("select status, provider_transaction_id from payments").all(),
		).toEqual([{ status: "confirmed", provider_transaction_id: "tx-1" }]);
		expect(
			await json(await webhook(notice(placed.code, placed.total))),
		).toMatchObject({
			duplicate: true,
		});
		expect(db.query("select count(*) as n from payments").get()).toEqual({
			n: 1,
		});

		const view = await json<{ status: string; paid: boolean }>(
			await send("GET", `/orders/${placed.code}?pago=tarjeta`),
		);
		expect(view).toMatchObject({ status: "paid", paid: true });
	});
});
