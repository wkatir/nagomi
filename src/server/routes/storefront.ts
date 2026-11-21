import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type Db, getDb, schema } from "#/db";
import { LOCALES, type Locale } from "#/db/schema";
import { storeToday } from "#/lib/dates";
import { intlLocale } from "#/lib/intl";
import { formatMoney } from "#/lib/money";
import { whatsappLink } from "#/lib/whatsapp";
import { m } from "#/paraglide/messages";
import { localeQuery, validate } from "#/server/validate";
import {
	type CatalogContext,
	listCatalog,
	listConcerns,
	listRoutines,
	pickLocale,
} from "../domain/catalog";
import { checkoutConsents } from "../domain/consents";
import { insertIfExists } from "../domain/d1";
import { idempotencyKey, requestHash } from "../domain/idempotency";
import { linesBeyondStock, stockFits } from "../domain/inventory";
import { newOrderCode } from "../domain/order-code";
import { promotionCodeOfOrder, returnedOfLine } from "../domain/order-sql";
import { checkoutPageVersions, currentPageTexts } from "../domain/pages";
import { amountOwed, paidAt, paymentSummary } from "../domain/payments";
import { displayPhone, normalizePhone } from "../domain/phone";
import { publishedPromises } from "../domain/promises";
import { promotionByCode } from "../domain/promotion-queries";
import {
	evaluatePromotion,
	normalizeCode,
	type PromotionRefusal,
} from "../domain/promotions";
import { phoneDigits, searchKey } from "../domain/search";
import {
	getPaymentMethods,
	getSettings,
	type StoreSettings,
} from "../domain/settings";
import { storeFreeShippingFrom } from "../domain/shipping";
import { missingCheckoutSettings } from "../domain/store-rules";
import { catalogContext } from "../domain/storefront-catalog";
import { withinLimit } from "../rate-limit";

const {
	customerConsents,
	customers,
	orderItems,
	orders,
	pages,

	payments,
	shippingZones,
} = schema;

// The per-line limit is checked in the handlers, since it lives in the database.
const cartItems = z
	.array(
		z.object({
			sku: z.string().min(1).max(40),
			quantity: z.number().int().min(1),
		}),
	)
	.min(1)
	.max(30)
	.refine(
		(items) => new Set(items.map((i) => i.sku)).size === items.length,
		"Duplicate SKU",
	);
const promotionCode = z.string().trim().min(1).max(40);
const phone = z.string().trim().min(1).max(30);

const whatsappOrder = z.object({
	idempotencyKey,
	locale: z.enum(LOCALES),
	items: cartItems,
	customerName: z.string().trim().min(1).max(80).optional(),
	// Needed for per-customer code limits and for the order lookup.
	phone: phone.optional(),
	promotionCode: promotionCode.optional(),
	consents: z.object({
		privacyNotice: z.literal(true),
		terms: z.literal(true),
		marketingWhatsapp: z.boolean(),
	}),
});

const activeZones = (db: Db) =>
	db
		.select({ method: shippingZones.method, freeFrom: shippingZones.freeFrom })
		.from(shippingZones)
		.where(eq(shippingZones.status, "active"));

async function orderByKey(db: Db, idempotencyKey: string) {
	const [found] = await db
		.select({ order: orders, promotionCode: promotionCodeOfOrder })
		.from(orders)
		.where(eq(orders.idempotencyKey, idempotencyKey));
	if (!found) return null;
	const items = await db
		.select()
		.from(orderItems)
		.where(eq(orderItems.orderId, found.order.id))
		.orderBy(asc(orderItems.id));
	return { ...found.order, promotionCode: found.promotionCode, items };
}

async function pricedLines(
	db: Db,
	context: CatalogContext,
	items: z.infer<typeof cartItems>,
) {
	const products = await listCatalog(db, context, {
		skus: items.map((i) => i.sku),
	});
	const lines = items.flatMap((i) => {
		const product = products.find((p) => p.sku === i.sku);
		return product ? [{ quantity: i.quantity, product }] : [];
	});
	if (lines.length !== items.length) return null;
	return {
		lines,
		subtotal: lines.reduce((n, l) => n + l.product.price * l.quantity, 0),
	};
}

async function applyPromotion(
	db: Db,
	settings: StoreSettings,
	locale: Locale,
	input: { code: string; phone: string | null; subtotal: number },
): Promise<
	| {
			ok: true;
			promotion: {
				id: number;
				code: string;
				type: "percentage" | "fixed";
				value: number;
			};
			description: string | null;
			discount: number;
	  }
	| {
			ok: false;
			code: string | null;
			reason: PromotionRefusal;
			minSubtotal: number | null;
	  }
> {
	const code = normalizeCode(input.code);
	if (!code)
		return { ok: false, code: null, reason: "not_found", minSubtotal: null };
	const found = await promotionByCode(db, code, input.phone, {
		locale,
		fallback: settings.defaultLocale,
	});
	if (!found)
		return { ok: false, code, reason: "not_found", minSubtotal: null };
	const result = evaluatePromotion(found.promotion, {
		subtotal: input.subtotal,
		today: storeToday(settings.timeZone),
		usage: found.usage,
	});
	if (!result.ok)
		return {
			ok: false,
			code,
			reason: result.reason,
			minSubtotal:
				result.reason === "min_subtotal_not_met"
					? found.promotion.minSubtotal
					: null,
		};
	const { id, type, value } = found.promotion;
	return {
		ok: true,
		promotion: { id, code, type, value },
		description: found.description,
		discount: result.discount,
	};
}

function e164(input: string | undefined, countryCode: string) {
	return input === undefined ? null : normalizePhone(input, countryCode);
}

export const storefront = new Hono()
	.get("/store", async (c) => {
		const db = getDb();
		const s = await getSettings(db);
		const [paymentMethods, promises, zones, legalPages] = await Promise.all([
			getPaymentMethods(db),
			publishedPromises(db, s),
			activeZones(db),
			checkoutPageVersions(db, s.defaultLocale, s.defaultLocale),
		]);
		return c.json({
			name: s.name,
			currency: s.currency,
			defaultLocale: s.defaultLocale,
			countryCode: s.countryCode,
			timeZone: s.timeZone,
			// Digits only, as wa.me expects.
			whatsappNumber: s.whatsappNumber,
			whatsappDisplay: s.whatsappNumber
				? displayPhone(`+${s.whatsappNumber}`)
				: null,
			freeShippingFrom: storeFreeShippingFrom(zones),
			maxQuantityPerLine: s.maxQuantityPerLine,
			returnWindowDays: s.returnWindowDays,
			checkoutOpen: missingCheckoutSettings(s).length === 0 && legalPages.ok,
			paymentMethods,
			promises,
			business: {
				foundingYear: s.foundingYear,
				legalName: s.legalName,
				taxIdLabel: s.taxIdLabel,
				taxId: s.taxId,
				address: s.address,
				phone: s.phone,
				email: s.email,
			},
		});
	})
	.get("/catalog", validate("query", localeQuery), async (c) => {
		const db = getDb();
		const { locale } = c.req.valid("query");
		const settings = await getSettings(db);
		const context = catalogContext(settings, locale);
		const [products, concerns, routines] = await Promise.all([
			listCatalog(db, context),
			listConcerns(db, locale, settings.defaultLocale),
			listRoutines(db, context),
		]);
		const used = new Set(products.flatMap((p) => p.concerns));
		return c.json({
			products,
			concerns: concerns.filter((x) => used.has(x.slug)),
			routines,
		});
	})
	.get("/pages/:slug", validate("query", localeQuery), async (c) => {
		const db = getDb();
		const { locale } = c.req.valid("query");
		const page = await db.query.pages.findFirst({
			where: and(
				eq(pages.slug, c.req.param("slug")),
				eq(pages.isPublished, true),
			),
		});
		if (!page) return c.json({ error: "not_found" }, 404);
		const settings = await getSettings(db);
		const texts = await currentPageTexts(db, page.id);
		const text = pickLocale(texts, locale, settings.defaultLocale);
		if (!text)
			throw new Error(
				`Published page ${page.slug} has no ${settings.defaultLocale} text`,
			);
		return c.json({
			slug: page.slug,
			title: text.title,
			bodyMarkdown: text.bodyMarkdown,
			updatedAt: page.updatedAt,
		});
	})
	// The order re-evaluates the code when placed. Rate limited because codes are guessable.
	.post(
		"/promotions/validate",
		validate(
			"json",
			z.object({
				locale: z.enum(LOCALES),
				code: promotionCode,
				items: cartItems,
				phone: phone.optional(),
			}),
		),
		async (c) => {
			const db = getDb();
			const input = c.req.valid("json");
			const settings = await getSettings(db);
			if (input.items.some((i) => i.quantity > settings.maxQuantityPerLine))
				return c.json(
					{ error: "quantity_exceeds_limit", max: settings.maxQuantityPerLine },
					400,
				);
			const givenPhone = e164(input.phone, settings.countryCode);
			if (!(await withinLimit(c, "promotion")))
				return c.json({ error: "rate_limited" }, 429);
			const cart = await pricedLines(
				db,
				catalogContext(settings, settings.defaultLocale),
				input.items,
			);
			if (!cart) return c.json({ error: "product_unavailable" }, 409);
			const applied = await applyPromotion(db, settings, input.locale, {
				code: input.code,
				phone: givenPhone,
				subtotal: cart.subtotal,
			});
			if (!applied.ok)
				return c.json({
					valid: false as const,
					code: applied.code,
					reason: applied.reason,
					minSubtotal: applied.minSubtotal,
					subtotal: cart.subtotal,
				});
			return c.json({
				valid: true as const,
				code: applied.promotion.code,
				type: applied.promotion.type,
				value: applied.promotion.value,
				description: applied.description,
				subtotal: cart.subtotal,
				discount: applied.discount,
				// Before shipping, which is confirmed on WhatsApp.
				total: cart.subtotal - applied.discount,
			});
		},
	)
	// Stored before the customer leaves for WhatsApp so every chat has a code to confirm
	// (consumer law requires confirmation by the next day). Discount code limits are
	// enforced by triggers, also under concurrent orders.
	.post("/orders/whatsapp", validate("json", whatsappOrder), async (c) => {
		const db = getDb();
		const input = c.req.valid("json");
		const settings = await getSettings(db);
		const legalPages = await checkoutPageVersions(
			db,
			input.locale,
			settings.defaultLocale,
		);
		const missing = [
			...missingCheckoutSettings(settings),
			...(legalPages.ok ? [] : legalPages.missing),
		];
		if (!settings.whatsappNumber || !legalPages.ok || missing.length > 0)
			return c.json({ error: "checkout_not_configured", fields: missing }, 503);
		if (input.items.some((i) => i.quantity > settings.maxQuantityPerLine))
			return c.json(
				{
					error: "quantity_exceeds_limit",
					max: settings.maxQuantityPerLine,
				},
				400,
			);
		const givenPhone = e164(input.phone, settings.countryCode);
		const code = input.promotionCode
			? (normalizeCode(input.promotionCode) ?? input.promotionCode)
			: null;

		const hash = await requestHash({
			channel: "whatsapp",
			locale: input.locale,
			customerName: input.customerName ?? null,
			consents: input.consents,
			items: [...input.items].sort((a, b) => a.sku.localeCompare(b.sku)),
			phone: givenPhone,
			promotionCode: code,
		});
		let order = await orderByKey(db, input.idempotencyKey);
		let status: 200 | 201 = 200;
		if (!order) {
			// Only new orders count against the limit, not retries.
			if (!(await withinLimit(c, "order")))
				return c.json({ error: "rate_limited" }, 429);
			const context = catalogContext(settings, settings.defaultLocale);
			const cart = await pricedLines(db, context, input.items);
			if (!cart) return c.json({ error: "product_unavailable" }, 409);
			const shortfall = (lines: { sku: string; available: number }[]) =>
				c.json(
					{
						error: "insufficient_stock",
						items: lines.map(({ sku, available }) => ({ sku, available })),
					},
					409,
				);
			const beyondStock = cart.lines.filter(
				(l) => l.quantity > l.product.maxQuantity,
			);
			if (beyondStock.length > 0)
				return shortfall(
					beyondStock.map((l) => ({
						sku: l.product.sku,
						available: l.product.maxQuantity,
					})),
				);
			let promotion: { id: number; code: string; discount: number } | null =
				null;
			if (code) {
				const applied = await applyPromotion(db, settings, input.locale, {
					code,
					phone: givenPhone,
					subtotal: cart.subtotal,
				});
				if (!applied.ok)
					return c.json(
						{
							error: "promotion_invalid",
							reason: applied.reason,
							minSubtotal: applied.minSubtotal,
						},
						409,
					);
				promotion = {
					id: applied.promotion.id,
					code: applied.promotion.code,
					discount: applied.discount,
				};
			}
			const discount = promotion?.discount ?? 0;

			const orderCode = newOrderCode(settings.orderCodePrefix);
			const ours = db
				.select({ id: orders.id })
				.from(orders)
				.where(eq(orders.code, orderCode));
			const wanted = cart.lines.map((l) => ({
				variantId: l.product.variantId,
				quantity: l.quantity,
				sku: l.product.sku,
			}));
			// One batch is one transaction. A concurrent retry with the same key inserts no
			// order, so its guarded lines are skipped and it reads the first order below. The
			// order is written only while its lines still fit in stock (another order may have
			// taken the units since they were read).
			await db.batch([
				insertIfExists(
					db,
					orders,
					{
						code: orderCode,
						idempotencyKey: input.idempotencyKey,
						requestHash: hash,
						customerName: input.customerName ?? null,
						customerPhone: givenPhone,
						searchKey: searchKey(
							orderCode,
							input.customerName,
							phoneDigits(givenPhone),
						),
						locale: input.locale,
						channel: "whatsapp",
						subtotal: cart.subtotal,
						discount,
						discountReason: promotion?.code ?? null,
						promotionId: promotion?.id ?? null,
						total: cart.subtotal - discount,
					},
					sql`(select 1 where ${stockFits(wanted, context)})`,
				).onConflictDoNothing({ target: orders.idempotencyKey }),
				// One statement per line keeps each under D1's 100 bound parameters.
				...cart.lines.map((l) =>
					insertIfExists(
						db,
						orderItems,
						{
							orderId: sql<number>`(select id from orders where code = ${orderCode})`,
							variantId: l.product.variantId,
							quantity: l.quantity,
							unitPrice: l.product.price,
							sku: l.product.sku,
							brandName: l.product.brand,
							productName: l.product.name,
							sizeValue: l.product.size?.value ?? null,
							sizeUnit: l.product.size?.unit ?? null,
						},
						ours,
					),
				),
				...checkoutConsents(input.consents, legalPages.versions).map(
					(consent) =>
						insertIfExists(
							db,
							customerConsents,
							{
								...consent,
								orderId: sql<number>`(select id from orders where code = ${orderCode})`,
								channel: "web",
							},
							ours,
						),
				),
			]);
			order = await orderByKey(db, input.idempotencyKey);
			// No order for the key: the stock guard refused it. Nothing short now means the
			// units were released since, so the customer can try again.
			if (!order) {
				const short = (await linesBeyondStock(db, context, wanted)).map(
					(l) => ({
						sku: l.sku,
						available: Math.min(l.available, settings.maxQuantityPerLine),
					}),
				);
				return short.length > 0
					? shortfall(short)
					: c.json({ error: "stock_changed" }, 409);
			}
			if (order.code === orderCode) status = 201;
		}
		if (order.requestHash !== hash)
			return c.json({ error: "idempotency_key_reused" }, 422);

		const money = (n: number) =>
			formatMoney(
				n,
				settings.currency,
				intlLocale(order.locale, settings.countryCode),
			);
		const opts = { locale: order.locale };
		const freeFrom = storeFreeShippingFrom(await activeZones(db));
		const merchandise = order.subtotal - order.discount;
		const text = [
			m.whatsapp_order_intro({ code: order.code }, opts),
			...order.items.map(
				(l) =>
					`• ${l.quantity} × ${l.brandName} ${l.productName}: ${money(l.unitPrice * l.quantity)}`,
			),
			m.whatsapp_order_subtotal({ amount: money(order.subtotal) }, opts),
			order.promotionCode
				? m.whatsapp_order_discount(
						{ code: order.promotionCode, amount: money(order.discount) },
						opts,
					)
				: null,
			freeFrom !== null && merchandise >= freeFrom
				? m.whatsapp_order_free_shipping({}, opts)
				: m.whatsapp_order_shipping_pending({}, opts),
			order.discount > 0
				? m.whatsapp_order_total({ amount: money(merchandise) }, opts)
				: null,
			order.customerName
				? m.whatsapp_order_name({ name: order.customerName }, opts)
				: null,
		]
			.filter(Boolean)
			.join("\n");

		return c.json(
			{
				code: order.code,
				whatsappUrl: whatsappLink(settings.whatsappNumber, text),
				subtotal: order.subtotal,
				discount: order.discount,
				promotionCode: order.promotionCode,
				// Before shipping, which is confirmed on WhatsApp.
				total: merchandise,
			},
			status,
		);
	})
	// A wrong code and a wrong phone get the same answer, and no personal data is
	// returned.
	.post(
		"/orders/lookup",
		validate(
			"json",
			z.object({ code: z.string().trim().min(3).max(32), phone }),
		),
		async (c) => {
			const db = getDb();
			const input = c.req.valid("json");
			const settings = await getSettings(db);
			if (!(await withinLimit(c, "lookup")))
				return c.json({ error: "rate_limited" }, 429);
			const givenPhone = e164(input.phone, settings.countryCode);
			const code = input.code.toUpperCase();
			const [[order], lines, confirmed] = await db.batch([
				db
					.select({
						order: orders,
						linkedPhone: customers.phoneE164,
						// Unique column names in a batch: see loadCatalog.
						promotionCode: sql<string | null>`${promotionCodeOfOrder}`.as(
							"promotion_code",
						),
					})
					.from(orders)
					.leftJoin(customers, eq(customers.id, orders.customerId))
					.where(eq(orders.code, code)),
				db
					.select({
						sku: orderItems.sku,
						brandName: orderItems.brandName,
						name: orderItems.productName,
						sizeValue: orderItems.sizeValue,
						sizeUnit: orderItems.sizeUnit,
						quantity: orderItems.quantity,
						unitPrice: orderItems.unitPrice,
						returned: returnedOfLine,
					})
					.from(orderItems)
					.innerJoin(orders, eq(orders.id, orderItems.orderId))
					.where(eq(orders.code, code))
					.orderBy(asc(orderItems.id)),
				db
					.select({
						kind: payments.kind,
						amount: payments.amount,
						recordedAt: payments.recordedAt,
					})
					.from(payments)
					.innerJoin(orders, eq(orders.id, payments.orderId))
					.where(and(eq(orders.code, code), eq(payments.status, "confirmed"))),
			]);
			const matches =
				order !== undefined &&
				givenPhone !== null &&
				(order.order.customerPhone === givenPhone ||
					order.linkedPhone === givenPhone);
			if (!matches) return c.json({ error: "order_not_found" }, 404);
			const o = order.order;
			const sum = (kind: "payment" | "refund") =>
				confirmed
					.filter((p) => p.kind === kind)
					.reduce((n, p) => n + p.amount, 0);
			const payment = paymentSummary(
				amountOwed({ ...o, lines }),
				sum("payment"),
				sum("refund"),
			);
			return c.json({
				code: o.code,
				status: o.status,
				locale: o.locale,
				// UTC instants.
				timeline: {
					placed: o.createdAt,
					confirmed: o.confirmedAt,
					paid:
						o.status === "cancelled"
							? null
							: paidAt(
									o.total,
									confirmed.filter((p) => p.kind === "payment"),
								),
					shipped: o.fulfilledAt,
					delivered: o.deliveredAt,
					cancelled: o.cancelledAt,
				},
				deliveryEstimate:
					o.deliveryEstimateFrom && o.deliveryEstimateTo
						? { from: o.deliveryEstimateFrom, to: o.deliveryEstimateTo }
						: null,
				shippingMethod: o.shippingMethod,
				paymentMethod: o.paymentMethod,
				lines: lines.map(({ sizeValue, sizeUnit, ...l }) => ({
					...l,
					size:
						sizeValue !== null && sizeUnit !== null
							? { value: sizeValue, unit: sizeUnit }
							: null,
					total: l.quantity * l.unitPrice,
				})),
				subtotal: o.subtotal,
				discount: o.discount,
				promotionCode: order.promotionCode,
				shipping: o.shipping,
				total: o.total,
				payment: {
					status: payment.status,
					owed: payment.owed,
					paid: payment.net,
					balance: payment.balance,
				},
			});
		},
	);
