import { env } from "cloudflare:workers";
import { and, asc, eq, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import {
	getCookie,
	getSignedCookie,
	setCookie,
	setSignedCookie,
} from "hono/cookie";
import { z } from "zod";
import { type Db, getDb, schema } from "#/db";
import { CHECKOUT_PAYMENT_METHODS, LOCALES } from "#/lib/enums";
import {
	isSvMunicipality,
	SV_MUNICIPALITIES,
	SV_PHONE_REGEX,
} from "#/lib/sv-locations";
import { sessionCustomer } from "../customer-session";
import {
	CART_COOKIE,
	CART_COOKIE_DAYS,
	type CartRecord,
	cartById,
	cartOfCustomer,
	evaluateCoupon,
	isCartId,
	itemMax,
	itemsOf,
	mergeInto,
	newCartId,
	priceCart,
	priceCartWithStock,
	stockView,
} from "../domain/cart";
import { OutOfStockError } from "../domain/cart-pricing";
import { normalizeEmail } from "../domain/customer-accounts";
import { mapDbError } from "../domain/db-errors";
import { idempotencyKey, requestHash } from "../domain/idempotency";
import { linesBeyondStock } from "../domain/inventory";
import { paidSum } from "../domain/order-sql";
import { checkoutPageVersions } from "../domain/pages";
import { InvalidPhoneError, normalizePhone } from "../domain/phone";
import {
	allocateStock,
	placeOrderStatements,
	planLines,
} from "../domain/place-order";
import { getSettings, type StoreSettings } from "../domain/settings";
import { missingCheckoutSettings } from "../domain/store-rules";
import {
	parseWebhook,
	validWebhookSignature,
	type WompiEnv,
	wompiClient,
	wompiCredentials,
} from "../payments/wompi";
import { withinLimit } from "../rate-limit";
import { validate } from "../validate";

const {
	bundles,
	cartItems,
	carts,
	customerAddresses,
	orderBundles,
	orderItems,
	orderStatusHistory,
	orders,
	payments,
	variants,
} = schema;

const ORDERS_COOKIE = "nagomi_orders";
const ORDERS_REMEMBERED = 5;

const wompi = () => wompiCredentials(env as WompiEnv);

const secureCookies = () => new URL(env.BETTER_AUTH_URL).protocol === "https:";

function rememberCart(c: Context, id: string) {
	setCookie(c, CART_COOKIE, id, {
		httpOnly: true,
		sameSite: "Lax",
		secure: secureCookies(),
		path: "/",
		maxAge: CART_COOKIE_DAYS * 86_400,
	});
}

async function rememberedOrders(c: Context): Promise<string[]> {
	const value = await getSignedCookie(c, env.BETTER_AUTH_SECRET, ORDERS_COOKIE);
	return value ? value.split(".") : [];
}

async function rememberOrder(c: Context, code: string) {
	const codes = [
		code,
		...(await rememberedOrders(c)).filter((x) => x !== code),
	];
	await setSignedCookie(
		c,
		ORDERS_COOKIE,
		codes.slice(0, ORDERS_REMEMBERED).join("."),
		env.BETTER_AUTH_SECRET,
		{
			httpOnly: true,
			sameSite: "Lax",
			secure: secureCookies(),
			path: "/",
			maxAge: 90 * 86_400,
		},
	);
}

async function resolveCart(
	c: Context,
	db: Db,
	settings: StoreSettings,
	create: boolean,
): Promise<CartRecord | null> {
	const customer = await sessionCustomer(c);
	const cookieId = getCookie(c, CART_COOKIE);
	let cookieCart = isCartId(cookieId) ? await cartById(db, cookieId) : null;
	if (cookieCart?.customerId != null && cookieCart.customerId !== customer?.id)
		cookieCart = null;
	if (customer) {
		const own = await cartOfCustomer(db, customer.id);
		if (cookieCart && cookieCart.customerId === null) {
			if (own) {
				await mergeInto(db, settings, cookieCart.id, own.id);
				rememberCart(c, own.id);
				return cartById(db, own.id);
			}
			await db
				.update(carts)
				.set({ customerId: customer.id })
				.where(
					and(eq(carts.id, cookieCart.id), sql`${carts.customerId} is null`),
				);
			return cartById(db, cookieCart.id);
		}
		if (own) {
			if (cookieId !== own.id) rememberCart(c, own.id);
			return own;
		}
	} else if (cookieCart) return cookieCart;
	if (!create) return null;
	const id = newCartId();
	const [created] = await db
		.insert(carts)
		.values({ id, customerId: customer?.id ?? null })
		.returning();
	rememberCart(c, id);
	return created;
}

const cartQuery = z.object({
	locale: z.enum(LOCALES),
	municipality: z.enum(SV_MUNICIPALITIES as [string, ...string[]]).optional(),
});

async function respondCart(
	c: Context,
	db: Db,
	settings: StoreSettings,
	cart: CartRecord | null,
	query: z.infer<typeof cartQuery>,
	status: 200 | 201 = 200,
) {
	const customer = await sessionCustomer(c);
	return c.json(
		await priceCart(db, settings, query.locale, cart, {
			municipality: query.municipality ?? null,
			email: customer?.email ?? null,
			cardConfigured: wompi() !== null,
		}),
		status,
	);
}

const touch = (db: Db, id: string) =>
	db
		.update(carts)
		.set({ updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))` })
		.where(eq(carts.id, id));

const addInput = z
	.object({
		sku: z.string().trim().min(1).max(40).optional(),
		bundle: z.string().trim().min(1).max(80).optional(),
		quantity: z.number().int().min(1).max(100),
	})
	.refine((v) => (v.sku === undefined) !== (v.bundle === undefined), {
		message: "Give a sku or a bundle",
	});

const itemId = z.object({ id: z.coerce.number().int().positive() });

const phoneField = z.string().trim().max(30);

const checkoutInput = z.object({
	idempotencyKey,
	locale: z.enum(LOCALES),
	name: z.string().trim().max(80),
	email: z.string().trim().max(120),
	phone: phoneField,
	delivery: z.union([
		z.object({ addressId: z.number().int().positive() }),
		z.object({
			department: z.string().trim().max(40),
			municipality: z.string().trim().max(60),
			addressLine: z.string().trim().max(200),
			reference: z.string().trim().max(200).optional(),
		}),
	]),
	paymentMethod: z.enum(CHECKOUT_PAYMENT_METHODS),
	consents: z.object({
		privacyNotice: z.boolean(),
		terms: z.boolean(),
		marketingEmail: z.boolean(),
		marketingWhatsapp: z.boolean(),
	}),
	notes: z.string().trim().max(500).optional(),
});

type FieldErrors = Partial<
	Record<
		| "name"
		| "email"
		| "phone"
		| "department"
		| "municipality"
		| "addressLine"
		| "address"
		| "paymentMethod"
		| "terms"
		| "privacyNotice",
		string
	>
>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "7123 4567", "7123-4567" and "+503 7123 4567" are the same number; it must be a
// Salvadoran one (+503 and 8 digits).
export function salvadoranPhone(input: string) {
	try {
		const phone = normalizePhone(input, "SV");
		return SV_PHONE_REGEX.test(phone) ? phone : null;
	} catch (e) {
		if (e instanceof InvalidPhoneError) return null;
		throw e;
	}
}

function siteUrl(path: string) {
	return new URL(path, env.BETTER_AUTH_URL).toString();
}

async function createCardPayment(
	db: Db,
	order: { id: number; code: string; total: number },
) {
	const credentials = wompi();
	if (!credentials) throw new Error("Card payment without Wompi credentials");
	const link = await wompiClient(credentials).createPaymentLink({
		reference: order.code,
		amount: order.total,
		productName: `Pedido ${order.code}`,
		redirectUrl: siteUrl(`/pedido/${order.code}?pago=tarjeta`),
		webhookUrl: siteUrl("/api/payments/wompi/webhook"),
	});
	await db.batch([
		db.insert(payments).values({
			orderId: order.id,
			kind: "payment",
			method: "card",
			amount: order.total,
			status: "pending",
			reference: `wompi-link:${link.linkId}`,
			recordedBy: "wompi",
		}),
		db
			.update(orders)
			.set({ paymentUrl: link.url })
			.where(and(eq(orders.id, order.id), eq(orders.status, "pending"))),
	]);
	return link.url;
}

const confirmedPaid = paidSum("payment");

async function orderView(db: Db, settings: StoreSettings, code: string) {
	const [row] = await db
		.select({ order: orders, paid: confirmedPaid, refunded: paidSum("refund") })
		.from(orders)
		.where(eq(orders.code, code));
	if (!row) return null;
	const o = row.order;
	const [lines, sets, history] = await db.batch([
		db
			.select({
				orderBundleId: orderItems.orderBundleId,
				sku: orderItems.sku,
				brandName: orderItems.brandName,
				productName: orderItems.productName,
				optionLabel: orderItems.optionLabel,
				quantity: orderItems.quantity,
				unitPrice: orderItems.unitPrice,
			})
			.from(orderItems)
			.where(eq(orderItems.orderId, o.id))
			.orderBy(asc(orderItems.id)),
		db
			.select({
				id: orderBundles.id,
				name: orderBundles.name,
				quantity: orderBundles.quantity,
				unitPrice: orderBundles.unitPrice,
				slug: bundles.slug,
			})
			.from(orderBundles)
			.innerJoin(bundles, eq(bundles.id, orderBundles.bundleId))
			.where(eq(orderBundles.orderId, o.id))
			.orderBy(asc(orderBundles.id)),
		db
			.select({
				from: orderStatusHistory.fromStatus,
				to: orderStatusHistory.toStatus,
				at: orderStatusHistory.changedAt,
			})
			.from(orderStatusHistory)
			.where(eq(orderStatusHistory.orderId, o.id))
			.orderBy(asc(orderStatusHistory.id)),
	]);
	const net = row.paid - row.refunded;
	const awaitingPayment =
		o.status === "pending" && o.paymentMethod !== "cash_on_delivery";
	return {
		code: o.code,
		status: o.status,
		locale: o.locale,
		createdAt: o.createdAt,
		customerName: o.customerName,
		paymentMethod: o.paymentMethod,
		paid: net >= o.total,
		paidAmount: net,
		items: [
			...lines
				.filter((l) => l.orderBundleId === null)
				.map(({ orderBundleId: _, ...l }) => ({
					kind: "variant" as const,
					name: [l.brandName, l.productName].join(" "),
					sku: l.sku,
					optionLabel: l.optionLabel,
					quantity: l.quantity,
					unitPrice: l.unitPrice,
					lineTotal: l.quantity * l.unitPrice,
					components: [],
				})),
			...sets.map((s) => ({
				kind: "bundle" as const,
				name: s.name,
				sku: null,
				optionLabel: null,
				quantity: s.quantity,
				unitPrice: s.unitPrice,
				lineTotal: s.quantity * s.unitPrice,
				components: lines
					.filter((l) => l.orderBundleId === s.id)
					.map((l) => ({
						sku: l.sku,
						name: [l.brandName, l.productName].join(" "),
						quantity: l.quantity,
					})),
			})),
		],
		subtotal: o.subtotal,
		discount: o.discount,
		discountReason: o.discountReason,
		shipping: o.shipping,
		total: o.total,
		taxIncluded: o.taxIncluded,
		shippingMethod: o.shippingMethod,
		shippingZoneName: o.shippingZoneName,
		address: {
			department: o.shipDepartment,
			municipality: o.shipMunicipality,
			addressLine: o.shipAddressLine,
			reference: o.shipReference,
		},
		deliveryEstimate:
			o.deliveryEstimateFrom && o.deliveryEstimateTo
				? { from: o.deliveryEstimateFrom, to: o.deliveryEstimateTo }
				: null,
		courier: o.courier,
		trackingCode: o.trackingCode,
		cancelReason: o.cancelReason,
		history,
		paymentUrl:
			awaitingPayment && o.paymentMethod === "card" ? o.paymentUrl : null,
		cardPaymentAvailable:
			awaitingPayment && o.paymentMethod === "card" && wompi() !== null,
		bankTransfer:
			awaitingPayment && o.paymentMethod === "bank_transfer"
				? {
						bank: settings.bankName,
						accountType: settings.bankAccountType,
						accountNumber: settings.bankAccountNumber,
						accountHolder: settings.bankAccountHolder,
						reference: o.code,
						dueHours: settings.followupPendingPaymentHours,
					}
				: null,
		paymentDueHours: awaitingPayment
			? settings.followupPendingPaymentHours
			: null,
	};
}

export type OrderView = NonNullable<Awaited<ReturnType<typeof orderView>>>;

async function mayOpen(
	c: Context,
	db: Db,
	code: string,
	email: string | undefined,
) {
	const order = await db.query.orders.findFirst({
		columns: { id: true, customerId: true, customerEmail: true },
		where: eq(orders.code, code),
	});
	if (!order) return { ok: false as const, limited: false };
	const customer = await sessionCustomer(c);
	if (customer && order.customerId === customer.id)
		return { ok: true as const };
	if ((await rememberedOrders(c)).includes(code)) return { ok: true as const };
	if (email === undefined) return { ok: false as const, limited: false };
	if (!(await withinLimit(c, "lookup")))
		return { ok: false as const, limited: true };
	return normalizeEmail(email) === order.customerEmail
		? { ok: true as const }
		: { ok: false as const, limited: false };
}

const orderCode = z.object({
	code: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z0-9-]{3,32}$/),
});

export const shop = new Hono()
	.get("/cart", validate("query", cartQuery), async (c) => {
		const db = getDb();
		const settings = await getSettings(db);
		const cart = await resolveCart(c, db, settings, false);
		return respondCart(c, db, settings, cart, c.req.valid("query"));
	})
	.post(
		"/cart/items",
		validate("query", cartQuery),
		validate("json", addInput),
		async (c) => {
			const db = getDb();
			const input = c.req.valid("json");
			const query = c.req.valid("query");
			const settings = await getSettings(db);
			const target = input.sku
				? await db.query.variants.findFirst({
						columns: { id: true },
						where: eq(variants.sku, input.sku),
					})
				: input.bundle &&
					(await db.query.bundles.findFirst({
						columns: { id: true },
						where: and(
							eq(bundles.slug, input.bundle),
							eq(bundles.status, "published"),
						),
					}));
			if (!target) return c.json({ error: "product_unavailable" }, 404);
			const cart = await resolveCart(c, db, settings, true);
			if (!cart) throw new Error("A cart was not created");
			const items = await itemsOf(db, cart.id);
			const ref = input.sku
				? { variantId: target.id, bundleId: null }
				: { variantId: null, bundleId: target.id };
			const same = items.find(
				(i) =>
					(ref.variantId !== null && i.variantId === ref.variantId) ||
					(ref.bundleId !== null && i.bundleId === ref.bundleId),
			);
			const view = await stockView(db, settings, query.locale, [...items, ref]);
			const probe = same ?? { id: -1, ...ref };
			const max = itemMax(probe, items, view, settings.maxQuantityPerLine);
			const sold =
				ref.variantId !== null
					? view.products.some((p) => p.variantId === ref.variantId)
					: view.bundles.some((b) => b.id === ref.bundleId);
			if (!sold) return c.json({ error: "product_unavailable" }, 404);
			const quantity = Math.min(max, (same?.quantity ?? 0) + input.quantity);
			if (quantity <= (same?.quantity ?? 0))
				return c.json({ error: "out_of_stock" as const, available: max }, 409);
			await db.batch([
				same
					? db
							.update(cartItems)
							.set({ quantity })
							.where(eq(cartItems.id, same.id))
					: db.insert(cartItems).values({ cartId: cart.id, ...ref, quantity }),
				touch(db, cart.id),
			]);
			return respondCart(c, db, settings, cart, query);
		},
	)
	.patch(
		"/cart/items/:id",
		validate("param", itemId),
		validate("query", cartQuery),
		validate("json", z.object({ quantity: z.number().int().min(1).max(100) })),
		async (c) => {
			const db = getDb();
			const query = c.req.valid("query");
			const settings = await getSettings(db);
			const cart = await resolveCart(c, db, settings, false);
			if (!cart) return c.json({ error: "not_found" }, 404);
			const items = await itemsOf(db, cart.id);
			const item = items.find((i) => i.id === c.req.valid("param").id);
			if (!item) return c.json({ error: "not_found" }, 404);
			const view = await stockView(db, settings, query.locale, items);
			const max = itemMax(item, items, view, settings.maxQuantityPerLine);
			const { quantity } = c.req.valid("json");
			if (quantity > max && quantity > item.quantity)
				return c.json({ error: "out_of_stock" as const, available: max }, 409);
			await db.batch([
				db.update(cartItems).set({ quantity }).where(eq(cartItems.id, item.id)),
				touch(db, cart.id),
			]);
			return respondCart(c, db, settings, cart, query);
		},
	)
	.delete(
		"/cart/items/:id",
		validate("param", itemId),
		validate("query", cartQuery),
		async (c) => {
			const db = getDb();
			const settings = await getSettings(db);
			const cart = await resolveCart(c, db, settings, false);
			if (!cart) return c.json({ error: "not_found" }, 404);
			await db
				.delete(cartItems)
				.where(
					and(
						eq(cartItems.id, c.req.valid("param").id),
						eq(cartItems.cartId, cart.id),
					),
				);
			return respondCart(c, db, settings, cart, c.req.valid("query"));
		},
	)
	.delete("/cart", validate("query", cartQuery), async (c) => {
		const db = getDb();
		const settings = await getSettings(db);
		const cart = await resolveCart(c, db, settings, false);
		if (cart)
			await db.batch([
				db.delete(cartItems).where(eq(cartItems.cartId, cart.id)),
				db
					.update(carts)
					.set({ promotionCode: null })
					.where(eq(carts.id, cart.id)),
			]);
		return respondCart(c, db, settings, cart, c.req.valid("query"));
	})
	// Rate limited because codes are guessable.
	.put(
		"/cart/coupon",
		validate("query", cartQuery),
		validate("json", z.object({ code: z.string().trim().min(1).max(40) })),
		async (c) => {
			const db = getDb();
			const query = c.req.valid("query");
			const settings = await getSettings(db);
			if (!(await withinLimit(c, "promotion")))
				return c.json({ error: "rate_limited" }, 429);
			const cart = await resolveCart(c, db, settings, false);
			if (!cart) return c.json({ error: "cart_empty" }, 409);
			const { cart: priced } = await priceCartWithStock(
				db,
				settings,
				query.locale,
				{ ...cart, promotionCode: null },
				{ municipality: null, email: null, cardConfigured: false },
			);
			if (priced.count === 0) return c.json({ error: "cart_empty" }, 409);
			const customer = await sessionCustomer(c);
			const coupon = await evaluateCoupon(db, settings, query.locale, {
				code: c.req.valid("json").code,
				email: customer?.email ?? null,
				subtotal: priced.subtotal,
			});
			if (!coupon.valid)
				return c.json(
					{
						error: "promotion_invalid" as const,
						reason: coupon.reason,
						minSubtotal: coupon.minSubtotal,
					},
					422,
				);
			await db
				.update(carts)
				.set({ promotionCode: coupon.code })
				.where(eq(carts.id, cart.id));
			return respondCart(
				c,
				db,
				settings,
				{ ...cart, promotionCode: coupon.code },
				query,
			);
		},
	)
	.delete("/cart/coupon", validate("query", cartQuery), async (c) => {
		const db = getDb();
		const settings = await getSettings(db);
		const cart = await resolveCart(c, db, settings, false);
		if (cart)
			await db
				.update(carts)
				.set({ promotionCode: null })
				.where(eq(carts.id, cart.id));
		return respondCart(
			c,
			db,
			settings,
			cart ? { ...cart, promotionCode: null } : null,
			c.req.valid("query"),
		);
	})
	.post("/checkout", validate("json", checkoutInput), async (c) => {
		const db = getDb();
		const input = c.req.valid("json");
		const settings = await getSettings(db);
		const legal = await checkoutPageVersions(
			db,
			input.locale,
			settings.defaultLocale,
		);
		const missing = [
			...missingCheckoutSettings(settings),
			...(legal.ok ? [] : legal.missing),
		];
		if (!legal.ok || missing.length > 0)
			return c.json(
				{ error: "checkout_not_configured" as const, fields: missing },
				503,
			);

		const existing = await db.query.orders.findFirst({
			where: eq(orders.idempotencyKey, input.idempotencyKey),
		});
		if (existing) {
			await rememberOrder(c, existing.code);
			return c.json(
				{
					code: existing.code,
					status: existing.status,
					paymentMethod: existing.paymentMethod,
					total: existing.total,
					redirectUrl: existing.paymentUrl,
					paymentError: null,
				},
				200,
			);
		}

		const customer = await sessionCustomer(c);
		const fields: FieldErrors = {};
		const name = input.name;
		if (!name) fields.name = "required";
		const email = normalizeEmail(input.email);
		if (!email) fields.email = "required";
		else if (!EMAIL.test(email)) fields.email = "invalid";
		const phone = input.phone ? salvadoranPhone(input.phone) : null;
		if (!input.phone) fields.phone = "required";
		else if (!phone) fields.phone = "invalid";

		let place: {
			department: string;
			municipality: string;
			addressLine: string;
			reference: string | null;
		} | null = null;
		if ("addressId" in input.delivery) {
			const address = customer
				? await db.query.customerAddresses.findFirst({
						where: and(
							eq(customerAddresses.id, input.delivery.addressId),
							eq(customerAddresses.customerId, customer.id),
							eq(customerAddresses.status, "active"),
						),
					})
				: undefined;
			if (!address) fields.address = "not_found";
			else
				place = {
					department: address.department,
					municipality: address.municipality,
					addressLine: address.addressLine,
					reference: address.reference,
				};
		} else {
			const d = input.delivery;
			if (!d.department) fields.department = "required";
			if (!d.municipality) fields.municipality = "required";
			else if (!isSvMunicipality(d.department, d.municipality))
				fields.municipality = "unknown";
			if (!d.addressLine) fields.addressLine = "required";
			if (!fields.department && !fields.municipality && !fields.addressLine)
				place = {
					department: d.department,
					municipality: d.municipality,
					addressLine: d.addressLine,
					reference: d.reference || null,
				};
		}
		if (!input.consents.terms) fields.terms = "required";
		if (!input.consents.privacyNotice) fields.privacyNotice = "required";
		if (Object.keys(fields).length > 0 || !place || !phone)
			return c.json({ error: "invalid_fields" as const, fields }, 422);

		if (!(await withinLimit(c, "order")))
			return c.json({ error: "rate_limited" }, 429);
		const cart = await resolveCart(c, db, settings, false);
		if (!cart) return c.json({ error: "cart_empty" as const }, 409);
		const priced = await priceCartWithStock(db, settings, input.locale, cart, {
			municipality: place.municipality,
			email,
			cardConfigured: wompi() !== null,
		});
		const total = priced.cart;
		if (total.count === 0) return c.json({ error: "cart_empty" as const }, 409);
		if (total.hasProblems)
			return c.json({ error: "cart_changed" as const, cart: total }, 409);
		if (!total.shippingQuote)
			return c.json(
				{
					error: "invalid_fields" as const,
					fields: { municipality: "no_shipping_zone" },
				},
				422,
			);
		if (total.coupon && !total.coupon.valid)
			return c.json(
				{
					error: "promotion_invalid" as const,
					reason: total.coupon.reason,
					minSubtotal: total.coupon.minSubtotal,
				},
				409,
			);
		const option = total.paymentOptions.find(
			(o) => o.method === input.paymentMethod,
		);
		if (!option || !option.available)
			return c.json(
				{
					error: "invalid_fields" as const,
					fields: { paymentMethod: option?.reason ?? "not_accepted" },
				},
				422,
			);

		const plan = planLines(total.lines, priced.view);
		let allocation: Awaited<ReturnType<typeof allocateStock>>;
		try {
			allocation = await allocateStock(db, plan.items);
		} catch (e) {
			if (e instanceof OutOfStockError)
				return c.json({ error: "cart_changed" as const, cart: total }, 409);
			throw e;
		}
		const { idempotencyKey: key, ...body } = input;
		const hash = await requestHash({
			...body,
			cart: priced.items.map((i) => [i.variantId, i.bundleId, i.quantity]),
			coupon: cart.promotionCode,
		});
		const { code, statements } = placeOrderStatements(db, {
			settings,
			locale: input.locale,
			channel: "web",
			idempotencyKey: key,
			requestHash: hash,
			customer: {
				id: customer?.id ?? null,
				name,
				email,
				phone,
			},
			delivery: {
				method: total.shippingQuote.method,
				zoneId: total.shippingQuote.zoneId,
				zoneName: total.shippingQuote.name,
				...place,
				daysMin: total.shippingQuote.deliveryDaysMin,
				daysMax: total.shippingQuote.deliveryDaysMax,
			},
			paymentMethod: input.paymentMethod,
			totals: { ...total, shipping: total.shippingQuote.fee },
			promotion: priced.promotion ?? null,
			items: plan.items,
			sets: plan.sets,
			allocation,
			consents: {
				privacyNotice: true,
				terms: true,
				marketingEmail: input.consents.marketingEmail,
				marketingWhatsapp: input.consents.marketingWhatsapp,
			},
			pageVersions: legal.versions,
			cartId: cart.id,
			notes: input.notes || null,
			createdBy: customer ? `customer:${customer.id}` : "checkout",
		});
		try {
			const [first, ...rest] = statements;
			await db.batch([first, ...rest]);
		} catch (e) {
			const mapped = mapDbError(e);
			if (mapped?.error === "stock_changed") {
				const short = await linesBeyondStock(db, plan.items);
				return c.json(
					{
						error: "insufficient_stock" as const,
						items: short.map((s) => ({ sku: s.sku, available: s.available })),
					},
					409,
				);
			}
			if (
				mapped &&
				[
					"promotion_unavailable",
					"promotion_limit_reached",
					"promotion_first_order_only",
					"promotion_changed",
				].includes(mapped.error)
			)
				return c.json(
					{
						error: "promotion_invalid" as const,
						reason: mapped.error,
						minSubtotal: null,
					},
					409,
				);
			throw e;
		}
		const order = await db.query.orders.findFirst({
			where: eq(orders.idempotencyKey, key),
		});
		if (!order) throw new Error(`Order ${code} was not written`);
		if (order.requestHash !== hash)
			return c.json({ error: "idempotency_key_reused" }, 422);
		await rememberOrder(c, order.code);
		let redirectUrl: string | null = null;
		let paymentError: string | null = null;
		if (order.paymentMethod === "card") {
			try {
				redirectUrl = await createCardPayment(db, order);
			} catch (e) {
				console.error(`Wompi payment link for ${order.code} failed`, e);
				paymentError = "gateway_unavailable";
			}
		}
		return c.json(
			{
				code: order.code,
				status: order.status,
				paymentMethod: order.paymentMethod,
				total: order.total,
				redirectUrl,
				paymentError,
			},
			201,
		);
	})
	.get(
		"/orders/:code",
		validate("param", orderCode),
		validate(
			"query",
			z.object({ email: z.string().trim().max(120).optional() }),
		),
		async (c) => {
			const db = getDb();
			const { code } = c.req.valid("param");
			const access = await mayOpen(c, db, code, c.req.valid("query").email);
			if (!access.ok)
				return access.limited
					? c.json({ error: "rate_limited" }, 429)
					: c.json({ error: "order_not_found" }, 404);
			const settings = await getSettings(db);
			const view = await orderView(db, settings, code);
			if (!view) return c.json({ error: "order_not_found" }, 404);
			return c.json(view);
		},
	)
	.post(
		"/orders/:code/pay",
		validate("param", orderCode),
		validate(
			"json",
			z.object({ email: z.string().trim().max(120).optional() }),
		),
		async (c) => {
			const db = getDb();
			const { code } = c.req.valid("param");
			const access = await mayOpen(c, db, code, c.req.valid("json").email);
			if (!access.ok) return c.json({ error: "order_not_found" }, 404);
			if (!wompi()) return c.json({ error: "card_unavailable" }, 409);
			const order = await db.query.orders.findFirst({
				where: eq(orders.code, code),
			});
			if (
				!order ||
				order.status !== "pending" ||
				order.paymentMethod !== "card"
			)
				return c.json({ error: "invalid_transition" }, 409);
			try {
				return c.json({ redirectUrl: await createCardPayment(db, order) });
			} catch (e) {
				console.error(`Wompi payment link for ${order.code} failed`, e);
				return c.json({ error: "gateway_unavailable" }, 502);
			}
		},
	)
	// Signed with the API secret; repeated notices change nothing.
	.post("/payments/wompi/webhook", async (c) => {
		const credentials = wompi();
		if (!credentials) return c.json({ error: "card_unavailable" }, 404);
		const raw = await c.req.text();
		const signature = c.req.header("wompi_hash");
		if (
			!(await validWebhookSignature(credentials.clientSecret, raw, signature))
		)
			return c.json({ error: "invalid_signature" }, 401);
		let json: unknown;
		try {
			json = JSON.parse(raw);
		} catch {
			return c.json({ error: "invalid_request" }, 400);
		}
		const notice = parseWebhook(json);
		if (!notice) return c.json({ error: "invalid_request" }, 400);
		const db = getDb();
		const seen = await db.query.payments.findFirst({
			columns: { id: true },
			where: eq(payments.providerTransactionId, notice.transactionId),
		});
		if (seen) return c.json({ ok: true, duplicate: true });
		if (!notice.approved) return c.json({ ok: true, approved: false });
		const order = await db.query.orders.findFirst({
			where: eq(orders.code, notice.reference),
		});
		if (!order) return c.json({ error: "order_not_found" }, 404);
		if (order.paymentMethod !== "card" || notice.amount !== order.total)
			return c.json({ error: "amount_mismatch" }, 409);
		const pendingPayment = await db.query.payments.findFirst({
			where: and(
				eq(payments.orderId, order.id),
				eq(payments.method, "card"),
				eq(payments.status, "pending"),
			),
		});
		const reference = `wompi:${notice.transactionId}${notice.production === false ? " (prueba)" : ""}`;
		try {
			await db.batch([
				pendingPayment
					? db
							.update(payments)
							.set({
								status: "confirmed",
								providerTransactionId: notice.transactionId,
								reference,
							})
							.where(
								and(
									eq(payments.id, pendingPayment.id),
									eq(payments.status, "pending"),
								),
							)
					: db.insert(payments).values({
							orderId: order.id,
							kind: "payment",
							method: "card",
							amount: notice.amount,
							status: "confirmed",
							reference,
							providerTransactionId: notice.transactionId,
							recordedBy: "wompi",
						}),
				db
					.update(orders)
					.set({
						status: "paid",
						paidAt: sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
					})
					.where(
						and(
							eq(orders.id, order.id),
							eq(orders.status, "pending"),
							sql`${confirmedPaid} >= ${orders.total}`,
						),
					),
			]);
		} catch (e) {
			if (
				mapDbError(e) === null &&
				/UNIQUE constraint failed: payments/.test(String(e))
			)
				return c.json({ ok: true, duplicate: true });
			throw e;
		}
		return c.json({ ok: true });
	});
