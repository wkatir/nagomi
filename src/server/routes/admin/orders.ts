import {
	and,
	asc,
	eq,
	inArray,
	isNull,
	notInArray,
	type SQLWrapper,
	sql,
} from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type Db, getDb, schema } from "#/db";
import {
	now,
	type OrderStatus,
	PAYMENT_METHODS,
	RETURN_DISPOSITIONS,
	RETURN_REASONS,
	SHIPPING_METHODS,
} from "#/db/schema";
import { storeToday } from "#/lib/dates";
import { calendarDate } from "#/lib/schemas/dates";
import { orderListSearch } from "#/lib/schemas/orders";
import type { AdminEnv } from "#/server/auth";
import { idParam, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { listCatalog } from "../../domain/catalog";
import { confirmationMessage } from "../../domain/confirmation";
import { insertIfExists, nextId, nonEmpty, qualified } from "../../domain/d1";
import { allocateFefo, InsufficientStockError } from "../../domain/fefo";
import { idempotencyKey, requestHash } from "../../domain/idempotency";
import { linesBeyondStock, lotStock, stockFits } from "../../domain/inventory";
import { newOrderCode } from "../../domain/order-code";
import { orderDetail, pagedOrders } from "../../domain/order-queries";
import { paidSum, returnedOfLine } from "../../domain/order-sql";
import { canTransition, SHIPPED_STATUSES } from "../../domain/order-state";
import { amountOwed, paymentSummary } from "../../domain/payments";
import { normalizePhone } from "../../domain/phone";
import {
	fullReturn,
	planReturn,
	RestockExpiredLotError,
	ReturnExceedsSoldError,
	type ReturnLinePlan,
	ReturnLotRequiredError,
	returnMovements,
	type SoldLot,
} from "../../domain/returns";
import { phoneDigits, searchKey } from "../../domain/search";
import { getPaymentMethods, getSettings } from "../../domain/settings";
import { zoneFee } from "../../domain/shipping";
import { catalogContext } from "../../domain/storefront-catalog";
import { money, requiredText } from "./catalog-inputs";

const {
	customerConsents,
	customers,
	inventoryMovements,
	lots,
	orderItems,
	orders,
	payments,
	promotions,
	returnLines,
	returns,
	shippingZones,
	shippingZoneTranslations,
} = schema;

const customerInput = z.object({
	name: requiredText(80),
	phone: z.string().trim().min(1).max(30).optional(),
});

// The upper bound per line is the store setting, checked in the handlers.
const itemsInput = z
	.array(
		z.object({
			variantId: z.number().int().positive(),
			quantity: z.number().int().positive(),
		}),
	)
	.min(1)
	.max(50)
	.refine(
		(items) => new Set(items.map((i) => i.variantId)).size === items.length,
		"Duplicate variant",
	);

const createInput = z.object({
	idempotencyKey,
	channel: z.enum(["whatsapp", "instagram", "in_person"]),
	customer: customerInput.optional(),
	items: itemsInput,
	notes: z.string().trim().max(500).optional(),
});

const editInput = z
	.object({
		items: itemsInput,
		notes: z.string().trim().max(500).nullable(),
		removePromotion: z.literal(true),
	})
	.partial()
	.refine(
		(v) =>
			v.items !== undefined ||
			v.notes !== undefined ||
			v.removePromotion !== undefined,
		{ message: "Nothing to change" },
	);

const confirmInput = z
	.object({
		paymentMethod: z.enum(PAYMENT_METHODS),
		paid: z.boolean(),
		shippingMethod: z.enum(SHIPPING_METHODS),
		shippingZoneId: z.number().int().positive().optional(),
		shippingFee: money.optional(),
		discount: money.optional(),
		discountReason: z.string().trim().min(1).max(120).optional(),
		deliveryFrom: calendarDate,
		deliveryTo: calendarDate,
		shipTo: z.string().trim().min(1).max(500).optional(),
		customer: customerInput.optional(),
	})
	.refine((v) => v.deliveryFrom <= v.deliveryTo, {
		message: "deliveryTo is before deliveryFrom",
		path: ["deliveryTo"],
	})
	.refine((v) => !v.discount || v.discountReason !== undefined, {
		message: "A discount needs its reason",
		path: ["discountReason"],
	})
	.refine((v) => v.shippingMethod !== "pickup" || !v.shippingZoneId, {
		message: "Pickup has no zone",
		path: ["shippingZoneId"],
	});

const returnInput = z.object({
	reason: z.enum(RETURN_REASONS).exclude(["delivery_failed"]),
	note: z.string().trim().max(500).optional(),
	lines: z
		.array(
			z.object({
				orderItemId: z.number().int().positive(),
				lotId: z.number().int().positive().optional(),
				quantity: z.number().int().positive(),
				disposition: z.enum(RETURN_DISPOSITIONS),
			}),
		)
		.min(1)
		.max(50),
});

const refundInput = z.object({
	amount: money.refine((n) => n > 0, "A refund is positive"),
	method: z.enum(PAYMENT_METHODS),
	reference: z.string().trim().min(1).max(120).optional(),
	returnId: z.number().int().positive().optional(),
});

const invalidTransition = (
	c: { json: (b: unknown, s: 409) => Response },
	action: string,
) => c.json({ error: "invalid_transition", action }, 409);

const returnedUnitsOfOrder = sql<number>`(select coalesce(sum(rl.quantity), 0) from return_lines rl join returns r on r.id = rl.return_id where r.order_id = ${qualified(orders.id)})`;

// `id` is a subquery: the customer is written in the same batch.
function customerUpsert(
	db: Db,
	input: { name: string; phone?: string },
	countryCode: string,
	guard: Parameters<typeof insertIfExists>[3],
) {
	if (!input.phone) return null;
	const phoneE164 = normalizePhone(input.phone, countryCode);
	return {
		upsert: insertIfExists(
			db,
			customers,
			{
				name: input.name,
				phoneE164,
				searchKey: searchKey(input.name, phoneDigits(phoneE164)),
			},
			guard,
		).onConflictDoUpdate({
			target: customers.phoneE164,
			set: {
				name: sql`coalesce(${customers.name}, excluded.name)`,
				searchKey: sql`case when ${customers.name} is null then excluded.search_key else ${customers.searchKey} end`,
			},
		}),
		id: sql<number>`(select id from customers where phone_e164 = ${phoneE164})`,
		name: input.name,
	};
}

// Compares every field the confirmation text shows. The expected lines travel as one JSON
// parameter, so the statement stays under D1's bound parameter limit.
function linesAsRead(
	orderId: number,
	lines: (typeof orderItems.$inferSelect)[],
) {
	const expected = JSON.stringify(
		lines.map((l) => [
			l.id,
			l.variantId,
			l.quantity,
			l.unitPrice,
			l.sku,
			l.brandName,
			l.productName,
			l.sizeValue,
			l.sizeUnit,
		]),
	);
	return sql`(select count(*) from order_items where order_id = ${orderId}) = ${lines.length} and not exists (select 1 from order_items oi where oi.order_id = ${orderId} and not exists (select 1 from json_each(${expected}) j where json_extract(j.value, '$[0]') is oi.id and json_extract(j.value, '$[1]') is oi.variant_id and json_extract(j.value, '$[2]') is oi.quantity and json_extract(j.value, '$[3]') is oi.unit_price and json_extract(j.value, '$[4]') is oi.sku and json_extract(j.value, '$[5]') is oi.brand_name and json_extract(j.value, '$[6]') is oi.product_name and json_extract(j.value, '$[7]') is oi.size_value and json_extract(j.value, '$[8]') is oi.size_unit))`;
}

const insufficientStock = (
	lines: {
		variantId: number;
		sku: string;
		quantity: number;
		available: number;
	}[],
) => ({
	error: "insufficient_stock" as const,
	lines: lines.map((l) => ({
		variantId: l.variantId,
		sku: l.sku,
		requested: l.quantity,
		available: l.available,
	})),
});

async function moneyState(db: Db, id: number) {
	const [row] = await db
		.select({
			code: orders.code,
			status: orders.status,
			subtotal: orders.subtotal,
			discount: orders.discount,
			shipping: orders.shipping,
			paymentMethod: orders.paymentMethod,
			paid: paidSum("payment"),
			refunded: paidSum("refund"),
			returnedUnits: returnedUnitsOfOrder,
		})
		.from(orders)
		.where(eq(orders.id, id));
	if (!row) return null;
	const lines = await db
		.select({
			quantity: orderItems.quantity,
			unitPrice: orderItems.unitPrice,
			returned: returnedOfLine,
		})
		.from(orderItems)
		.where(eq(orderItems.orderId, id));
	const summary = paymentSummary(
		amountOwed({ ...row, lines }),
		row.paid,
		row.refunded,
	);
	const unchanged = db
		.select({ id: orders.id })
		.from(orders)
		.where(
			and(
				eq(orders.id, id),
				eq(orders.status, row.status),
				sql`${paidSum("payment")} = ${row.paid}`,
				sql`${paidSum("refund")} = ${row.refunded}`,
				sql`${returnedUnitsOfOrder} = ${row.returnedUnits}`,
			),
		);
	return { row, summary, unchanged };
}

async function soldLots(db: Db, orderId: number): Promise<SoldLot[]> {
	const [sales, returned] = await Promise.all([
		db
			.select({
				orderItemId: inventoryMovements.orderItemId,
				lotId: inventoryMovements.lotId,
				expiresOn: lots.expiresOn,
				sold: sql<number>`-sum(${inventoryMovements.quantity})`,
			})
			.from(inventoryMovements)
			.innerJoin(orderItems, eq(orderItems.id, inventoryMovements.orderItemId))
			.innerJoin(lots, eq(lots.id, inventoryMovements.lotId))
			.where(
				and(
					eq(orderItems.orderId, orderId),
					eq(inventoryMovements.kind, "sale"),
				),
			)
			.groupBy(inventoryMovements.orderItemId, inventoryMovements.lotId),
		db
			.select({
				orderItemId: returnLines.orderItemId,
				lotId: returnLines.lotId,
				quantity: sql<number>`sum(${returnLines.quantity})`,
			})
			.from(returnLines)
			.innerJoin(returns, eq(returns.id, returnLines.returnId))
			.where(eq(returns.orderId, orderId))
			.groupBy(returnLines.orderItemId, returnLines.lotId),
	]);
	return sales.map((s) => {
		if (s.orderItemId === null) throw new Error("Sale movement without line");
		return {
			orderItemId: s.orderItemId,
			lotId: s.lotId,
			expiresOn: s.expiresOn,
			sold: s.sold,
			returned:
				returned.find(
					(r) => r.orderItemId === s.orderItemId && r.lotId === s.lotId,
				)?.quantity ?? 0,
		};
	});
}

// A batch runs alone in one transaction, so inside it the newest return of the order is
// this one, and each line's id is the last inserted row when its movements are written.
function returnStatements(
	db: Db,
	orderId: number,
	header: { reason: (typeof RETURN_REASONS)[number]; note: string | null },
	plan: ReturnLinePlan[],
	actor: string,
	guard: SQLWrapper,
) {
	const returnId = sql<number>`(select max(id) from returns where order_id = ${orderId})`;
	return {
		header: insertIfExists(
			db,
			returns,
			{ orderId, ...header, createdBy: actor },
			guard,
		).returning({ id: returns.id }),
		lines: plan.flatMap((line) => {
			const [back, waste] = returnMovements(line);
			if (!back) throw new Error("A return line needs a movement");
			return [
				insertIfExists(db, returnLines, { returnId, ...line }, guard),
				insertIfExists(
					db,
					inventoryMovements,
					{
						...back,
						returnLineId: sql<number>`last_insert_rowid()`,
						createdBy: actor,
					},
					guard,
				),
				...(waste
					? [
							insertIfExists(
								db,
								inventoryMovements,
								{
									...waste,
									returnLineId: sql<number>`(select return_line_id from inventory_movements where id = last_insert_rowid())`,
									createdBy: actor,
								},
								guard,
							),
						]
					: []),
			];
		}),
	};
}

export const ordersRouter = new Hono<AdminEnv>()
	.get("/", validate("query", orderListSearch), async (c) => {
		const settings = await getSettings(getDb());
		return c.json(
			await pagedOrders(getDb(), settings.timeZone, c.req.valid("query")),
		);
	})
	.get("/:id", validate("param", idParam), async (c) => {
		const db = getDb();
		const { id } = c.req.valid("param");
		const detail = await orderDetail(db, id);
		if (!detail) return c.json({ error: "not_found" }, 404);
		return c.json(detail);
	})
	.post("/", validate("json", createInput), async (c) => {
		const db = getDb();
		const input = c.req.valid("json");
		const actor = c.var.adminUserId;
		const settings = await getSettings(db);
		if (input.items.some((i) => i.quantity > settings.maxQuantityPerLine))
			return c.json(
				{ error: "quantity_exceeds_limit", max: settings.maxQuantityPerLine },
				400,
			);
		const hash = await requestHash({
			channel: input.channel,
			customer: input.customer ?? null,
			notes: input.notes ?? null,
			items: [...input.items].sort((a, b) => a.variantId - b.variantId),
		});
		const existing = await db.query.orders.findFirst({
			where: eq(orders.idempotencyKey, input.idempotencyKey),
		});
		if (existing)
			return existing.requestHash === hash
				? c.json({ id: existing.id, code: existing.code }, 200)
				: c.json({ error: "idempotency_key_reused" }, 422);

		const code = newOrderCode(settings.orderCodePrefix);
		const orderId = sql<number>`(select id from orders where code = ${code})`;
		const ours = db
			.select({ id: orders.id })
			.from(orders)
			.where(eq(orders.code, code));
		const context = catalogContext(settings, settings.defaultLocale);
		const fits = stockFits(input.items, context);
		// The customer is written only with this request's order: a reused key or a refusal
		// for stock leaves no trace.
		const keyFree = sql`(select 1 where not exists (select 1 from orders where idempotency_key = ${input.idempotencyKey}) and ${fits})`;
		const customer = input.customer
			? customerUpsert(db, input.customer, settings.countryCode, keyFree)
			: null;
		const products = await listCatalog(db, context, {
			variantIds: input.items.map((i) => i.variantId),
		});
		const lines = input.items.flatMap((i) => {
			const product = products.find((p) => p.variantId === i.variantId);
			return product ? [{ ...i, sku: product.sku, product }] : [];
		});
		if (lines.length !== input.items.length)
			return c.json({ error: "variant_unavailable" }, 409);
		const beyondStock = lines.filter((l) => l.quantity > l.product.maxQuantity);
		if (beyondStock.length > 0)
			return c.json(
				insufficientStock(
					beyondStock.map((l) => ({ ...l, available: l.product.maxQuantity })),
				),
				409,
			);
		const subtotal = lines.reduce(
			(n, l) => n + l.product.price * l.quantity,
			0,
		);

		await db.batch(
			nonEmpty([
				...(customer ? [customer.upsert] : []),
				insertIfExists(
					db,
					orders,
					{
						code,
						idempotencyKey: input.idempotencyKey,
						requestHash: hash,
						locale: settings.defaultLocale,
						channel: input.channel,
						customerId: customer?.id ?? null,
						customerName: input.customer?.name ?? null,
						searchKey: searchKey(code, input.customer?.name),
						subtotal,
						total: subtotal,
						notes: input.notes ?? null,
					},
					sql`(select 1 where ${fits})`,
				).onConflictDoNothing({ target: orders.idempotencyKey }),
				// One statement per line keeps each under D1's 100 bound parameters.
				...lines.map((l) =>
					insertIfExists(
						db,
						orderItems,
						{
							orderId,
							variantId: l.variantId,
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
				audit(
					db,
					{
						actorUserId: actor,
						action: "order.create",
						entityType: "order",
						entityId: orderId,
						data: { code, channel: input.channel, subtotal },
					},
					ours,
				),
			]),
		);
		const stored = await db.query.orders.findFirst({
			where: eq(orders.idempotencyKey, input.idempotencyKey),
		});
		// No order for the key: the stock guard refused it. Nothing short now means the units
		// were released since, so the request can be retried.
		if (!stored) {
			const short = await linesBeyondStock(db, context, lines);
			return short.length > 0
				? c.json(insufficientStock(short), 409)
				: c.json({ error: "stock_changed" }, 409);
		}
		if (stored.requestHash !== hash)
			return c.json({ error: "idempotency_key_reused" }, 422);
		return c.json(
			{ id: stored.id, code: stored.code },
			stored.code === code ? 201 : 200,
		);
	})
	// Kept lines keep their price; added lines take the published one.
	.patch(
		"/:id",
		validate("param", idParam),
		validate("json", editInput),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const input = c.req.valid("json");
			const actor = c.var.adminUserId;
			const order = await db.query.orders.findFirst({
				where: eq(orders.id, id),
			});
			if (!order) return c.json({ error: "not_found" }, 404);
			if (order.status !== "pending") return invalidTransition(c, "edit");
			const settings = await getSettings(db);
			const items = input.items ?? [];
			if (items.some((i) => i.quantity > settings.maxQuantityPerLine))
				return c.json(
					{ error: "quantity_exceeds_limit", max: settings.maxQuantityPerLine },
					400,
				);
			const context = catalogContext(settings, settings.defaultLocale);
			const pending = and(
				eq(orders.id, id),
				eq(orders.status, "pending"),
				input.items ? stockFits(items, context, id) : undefined,
			);
			const stillPending = db
				.select({ id: orders.id })
				.from(orders)
				.where(pending);
			const current = await db
				.select({
					variantId: orderItems.variantId,
					unitPrice: orderItems.unitPrice,
					sku: orderItems.sku,
				})
				.from(orderItems)
				.where(eq(orderItems.orderId, id));
			const added = items.filter(
				(i) => !current.some((x) => x.variantId === i.variantId),
			);
			const products =
				added.length === 0
					? []
					: await listCatalog(db, context, {
							variantIds: added.map((i) => i.variantId),
						});
			if (products.length !== added.length)
				return c.json({ error: "variant_unavailable" }, 409);
			const beyondStock = () =>
				linesBeyondStock(
					db,
					context,
					items.map((i) => {
						const sku =
							current.find((x) => x.variantId === i.variantId)?.sku ??
							products.find((p) => p.variantId === i.variantId)?.sku;
						if (sku === undefined)
							throw new Error(`Order ${id}: variant ${i.variantId} has no sku`);
						return { ...i, sku };
					}),
					id,
				);
			if (input.items) {
				const short = await beyondStock();
				if (short.length > 0) return c.json(insufficientStock(short), 409);
			}
			const linesTotal = sql<number>`(select coalesce(sum(quantity * unit_price), 0) from order_items where order_id = ${id})`;
			// A code's terms never change once used, so its discount is recomputed on the new
			// lines; below its minimum the code must be removed. The trigger
			// orders_promotion_discount_update checks the result.
			const promotion =
				order.promotionId === null || input.removePromotion
					? null
					: await db.query.promotions.findFirst({
							where: eq(promotions.id, order.promotionId),
						});
			if (promotion && input.items && promotion.minSubtotal !== null) {
				const subtotal = items.reduce((n, i) => {
					const price =
						current.find((x) => x.variantId === i.variantId)?.unitPrice ??
						products.find((p) => p.variantId === i.variantId)?.price;
					if (price === undefined) throw new Error(`Unpriced ${i.variantId}`);
					return n + price * i.quantity;
				}, 0);
				if (subtotal < promotion.minSubtotal)
					return c.json(
						{
							error: "promotion_min_subtotal",
							minSubtotal: promotion.minSubtotal,
						},
						409,
					);
			}
			// D1 binds numbers as REAL: cast so the division stays an integer one.
			const integer = (n: number) => sql`cast(${n} as integer)`;
			const discount = input.removePromotion
				? sql<number>`0`
				: promotion?.type === "percentage"
					? sql<number>`(${linesTotal} * ${integer(promotion.value)} + 50) / 100`
					: promotion?.type === "fixed"
						? sql<number>`min(${integer(promotion.value)}, ${linesTotal})`
						: sql<number>`${orders.discount}`;
			const results = await db.batch([
				audit(
					db,
					{
						actorUserId: actor,
						action: "order.update",
						entityType: "order",
						entityId: id,
						data: input,
					},
					stillPending,
				),
				...(input.items
					? [
							db.delete(orderItems).where(
								and(
									eq(orderItems.orderId, id),
									notInArray(
										orderItems.variantId,
										items.map((i) => i.variantId),
									),
									sql`exists ${stillPending}`,
								),
							),
							...items
								.filter((i) => !added.includes(i))
								.map((i) =>
									db
										.update(orderItems)
										.set({ quantity: i.quantity })
										.where(
											and(
												eq(orderItems.orderId, id),
												eq(orderItems.variantId, i.variantId),
												sql`exists ${stillPending}`,
											),
										),
								),
							...added.map((i) => {
								const product = products.find(
									(p) => p.variantId === i.variantId,
								);
								if (!product) throw new Error(`Unchecked ${i.variantId}`);
								return insertIfExists(
									db,
									orderItems,
									{
										orderId: id,
										variantId: i.variantId,
										quantity: i.quantity,
										unitPrice: product.price,
										sku: product.sku,
										brandName: product.brand,
										productName: product.name,
										sizeValue: product.size?.value ?? null,
										sizeUnit: product.size?.unit ?? null,
									},
									stillPending,
								);
							}),
						]
					: []),
				db
					.update(orders)
					.set({
						subtotal: linesTotal,
						discount,
						total: sql`${linesTotal} - ${discount} + ${orders.shipping}`,
						...(input.removePromotion
							? { promotionId: null, discountReason: null }
							: {}),
						...(input.notes !== undefined ? { notes: input.notes } : {}),
					})
					.where(pending),
			]);
			if (!results[results.length - 1].meta.changes) {
				const short = input.items ? await beyondStock() : [];
				return short.length > 0
					? c.json(insufficientStock(short), 409)
					: invalidTransition(c, "edit");
			}
			return c.json({ ok: true });
		},
	)
	// Every write is conditioned on the order as read here, so a concurrent confirm or edit
	// changes nothing.
	.post(
		"/:id/confirm",
		validate("param", idParam),
		validate("json", confirmInput),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const input = c.req.valid("json");
			const actor = c.var.adminUserId;
			const [order, settings, accepted] = await Promise.all([
				db.query.orders.findFirst({ where: eq(orders.id, id) }),
				getSettings(db),
				getPaymentMethods(db),
			]);
			if (!order) return c.json({ error: "not_found" }, 404);
			if (!canTransition(order.status, "confirmed"))
				return invalidTransition(c, "confirm");
			if (!accepted.includes(input.paymentMethod))
				return c.json({ error: "payment_method_not_accepted" }, 409);
			if (input.deliveryFrom < storeToday(settings.timeZone))
				return c.json({ error: "delivery_estimate_in_past" }, 400);
			if (input.shippingZoneId && input.shippingFee !== undefined)
				return c.json({ error: "shipping_fee_with_zone" }, 400);
			const items = await db
				.select()
				.from(orderItems)
				.where(eq(orderItems.orderId, id))
				.orderBy(asc(orderItems.id));
			if (
				items.reduce((n, l) => n + l.quantity * l.unitPrice, 0) !==
				order.subtotal
			)
				return c.json({ error: "order_subtotal_mismatch" }, 409);
			const discount = input.discount ?? order.discount;
			const discountReason =
				input.discount === undefined
					? order.discountReason
					: (input.discountReason ?? null);
			if (discount > order.subtotal)
				return c.json({ error: "discount_exceeds_subtotal" }, 400);
			const merchandise = order.subtotal - discount;

			let zone: { id: number; name: string; fee: number } | null = null;
			if (input.shippingZoneId) {
				const [row] = await db
					.select({
						zone: shippingZones,
						name: shippingZoneTranslations.name,
					})
					.from(shippingZones)
					.leftJoin(
						shippingZoneTranslations,
						and(
							eq(shippingZoneTranslations.zoneId, shippingZones.id),
							eq(shippingZoneTranslations.locale, settings.defaultLocale),
						),
					)
					.where(
						and(
							eq(shippingZones.id, input.shippingZoneId),
							eq(shippingZones.status, "active"),
							eq(shippingZones.method, input.shippingMethod),
						),
					);
				if (!row) return c.json({ error: "shipping_zone_unavailable" }, 409);
				// An active zone always has its default-locale name: creating or restoring a
				// zone and changing the default locale require one.
				if (row.name === null)
					throw new Error(
						`Active shipping zone ${row.zone.id} has no ${settings.defaultLocale} text`,
					);
				zone = {
					id: row.zone.id,
					name: row.name,
					fee: zoneFee(row.zone, merchandise),
				};
			}
			const shipping = zone
				? zone.fee
				: input.shippingMethod === "pickup"
					? (input.shippingFee ?? 0)
					: input.shippingFee;
			if (shipping === undefined)
				return c.json({ error: "shipping_fee_required" }, 400);
			const total = merchandise + shipping;

			// A pending order past its deadline no longer holds its units (stock.ts).
			const context = catalogContext(settings, settings.defaultLocale);
			const beyondStock = () => linesBeyondStock(db, context, items, id);
			const short = await beyondStock();
			if (short.length > 0) return c.json(insufficientStock(short), 409);

			// The stored text lists these lines, so a concurrent edit with the same subtotal
			// must fail the guard too.
			const pending = and(
				eq(orders.id, id),
				eq(orders.status, "pending"),
				eq(orders.subtotal, order.subtotal),
				eq(orders.discount, order.discount),
				order.promotionId === null
					? isNull(orders.promotionId)
					: eq(orders.promotionId, order.promotionId),
				linesAsRead(id, items),
				stockFits(items, context, id),
			);
			const stillPending = db
				.select({ id: orders.id })
				.from(orders)
				.where(pending);
			const customer = input.customer
				? customerUpsert(db, input.customer, settings.countryCode, stillPending)
				: null;

			const message = confirmationMessage({
				storeName: settings.name,
				code: order.code,
				locale: order.locale,
				countryCode: settings.countryCode,
				currency: settings.currency,
				lines: items,
				subtotal: order.subtotal,
				discount,
				discountReason,
				shipping,
				shippingMethod: input.shippingMethod,
				zoneName: zone?.name ?? null,
				total,
				paymentMethod: input.paymentMethod,
				delivery: { from: input.deliveryFrom, to: input.deliveryTo },
			});

			const results = await db.batch([
				audit(
					db,
					{
						actorUserId: actor,
						action: "order.status",
						entityType: "order",
						entityId: id,
						data: {
							from: "pending",
							to: "confirmed",
							shipping,
							discount,
							total,
							paymentMethod: input.paymentMethod,
							paid: input.paid,
						},
					},
					stillPending,
				),
				...(customer ? [customer.upsert] : []),
				...(input.paid && total > 0
					? [
							insertIfExists(
								db,
								payments,
								{
									orderId: id,
									kind: "payment",
									method: input.paymentMethod,
									amount: total,
									status: "confirmed",
									recordedBy: actor,
								},
								stillPending,
							),
						]
					: []),
				db
					.update(orders)
					.set({
						status: "confirmed",
						confirmedAt: now,
						paymentMethod: input.paymentMethod,
						discount,
						discountReason,
						shipping,
						total,
						shippingMethod: input.shippingMethod,
						shippingZoneId: zone?.id ?? null,
						shippingZoneName: zone?.name ?? null,
						shipTo: input.shipTo ?? null,
						deliveryEstimateFrom: input.deliveryFrom,
						deliveryEstimateTo: input.deliveryTo,
						confirmationMessage: message,
						...(customer
							? {
									customerId: customer.id,
									customerName: order.customerName ?? customer.name,
									searchKey: searchKey(
										order.code,
										order.customerName ?? customer.name,
									),
								}
							: {}),
					})
					.where(pending),
				db
					.update(customerConsents)
					.set({
						customerId: sql`(select customer_id from orders where id = ${id})`,
					})
					.where(
						and(
							eq(customerConsents.orderId, id),
							sql`${customerConsents.customerId} is null`,
							sql`(select customer_id from orders where id = ${id}) is not null`,
						),
					),
			]);
			if (!results[results.length - 2].meta.changes) {
				const taken = await beyondStock();
				return taken.length > 0
					? c.json(insufficientStock(taken), 409)
					: invalidTransition(c, "confirm");
			}
			return c.json({ ok: true, confirmationMessage: message });
		},
	)
	.post("/:id/mark-paid", validate("param", idParam), async (c) => {
		const db = getDb();
		const { id } = c.req.valid("param");
		const actor = c.var.adminUserId;
		const state = await moneyState(db, id);
		if (!state) return c.json({ error: "not_found" }, 404);
		const { row, summary, unchanged } = state;
		const { status } = row;
		if (
			status !== "confirmed" &&
			status !== "fulfilled" &&
			status !== "delivered"
		)
			return invalidTransition(c, "mark-paid");
		if (!row.paymentMethod)
			throw new Error(`Order ${id} is ${row.status} without a payment method`);
		if (summary.balance <= 0) return invalidTransition(c, "mark-paid");
		const results = await db.batch([
			audit(
				db,
				{
					actorUserId: actor,
					action: "payment.create",
					entityType: "payment",
					entityId: nextId(payments),
					data: {
						orderId: id,
						kind: "payment",
						amount: summary.balance,
						method: row.paymentMethod,
					},
				},
				unchanged,
			),
			insertIfExists(
				db,
				payments,
				{
					orderId: id,
					kind: "payment",
					method: row.paymentMethod,
					amount: summary.balance,
					status: "confirmed",
					recordedBy: actor,
				},
				unchanged,
			),
		]);
		if (!results[results.length - 1].meta.changes)
			return invalidTransition(c, "mark-paid");
		return c.json({ ok: true, amount: summary.balance });
	})
	.post(
		"/:id/refunds",
		validate("param", idParam),
		validate("json", refundInput),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const input = c.req.valid("json");
			const actor = c.var.adminUserId;
			const state = await moneyState(db, id);
			if (!state) return c.json({ error: "not_found" }, 404);
			const { summary, unchanged } = state;
			if (input.returnId) {
				const ret = await db.query.returns.findFirst({
					where: and(eq(returns.id, input.returnId), eq(returns.orderId, id)),
				});
				if (!ret) return c.json({ error: "not_found" }, 404);
			}
			if (input.amount > summary.refundable)
				return c.json(
					{
						error: "refund_exceeds_refundable",
						refundable: summary.refundable,
					},
					409,
				);
			const [, refund] = await db.batch([
				audit(
					db,
					{
						actorUserId: actor,
						action: "payment.create",
						entityType: "payment",
						entityId: nextId(payments),
						data: { orderId: id, kind: "refund", ...input },
					},
					unchanged,
				),
				insertIfExists(
					db,
					payments,
					{
						orderId: id,
						kind: "refund",
						method: input.method,
						amount: input.amount,
						status: "confirmed",
						reference: input.reference ?? null,
						returnId: input.returnId ?? null,
						recordedBy: actor,
					},
					unchanged,
				),
			]);
			if (!refund.meta.changes) return invalidTransition(c, "refund");
			return c.json({ ok: true }, 201);
		},
	)
	// Triggers refuse a sale movement for an order no longer confirmed and any movement that
	// would take a lot below zero, so a concurrent fulfil rolls the whole batch back (409).
	.post("/:id/fulfill", validate("param", idParam), async (c) => {
		const db = getDb();
		const { id } = c.req.valid("param");
		const actor = c.var.adminUserId;
		const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
		if (!order) return c.json({ error: "not_found" }, 404);
		if (!canTransition(order.status, "fulfilled"))
			return invalidTransition(c, "fulfill");
		const itemsOfOrder = eq(orderItems.orderId, id);
		const [items, stock, settings] = await Promise.all([
			db.select().from(orderItems).where(itemsOfOrder),
			lotStock(
				db,
				inArray(
					lots.variantId,
					db
						.select({ id: orderItems.variantId })
						.from(orderItems)
						.where(itemsOfOrder),
				),
			),
			getSettings(db),
		]);
		const today = storeToday(settings.timeZone);
		let movements: (typeof inventoryMovements.$inferInsert)[];
		try {
			movements = items.flatMap((item) =>
				allocateFefo(
					stock.filter((s) => s.variantId === item.variantId),
					item.quantity,
					today,
				).map((a) => ({
					lotId: a.lotId,
					kind: "sale" as const,
					quantity: -a.quantity,
					orderItemId: item.id,
					createdBy: actor,
				})),
			);
		} catch (e) {
			if (e instanceof InsufficientStockError)
				return c.json(
					{
						error: "insufficient_stock",
						available: e.available,
						requested: e.requested,
					},
					409,
				);
			throw e;
		}
		const [first, ...rest] = movements.map((m) =>
			db.insert(inventoryMovements).values(m),
		);
		if (!first) throw new Error(`Order ${id} has no items to fulfil`);
		const results = await db.batch([
			first,
			...rest,
			db
				.update(orders)
				.set({ status: "fulfilled", fulfilledAt: now })
				.where(and(eq(orders.id, id), eq(orders.status, "confirmed"))),
			audit(db, {
				actorUserId: actor,
				action: "order.status",
				entityType: "order",
				entityId: id,
				data: {
					from: "confirmed",
					to: "fulfilled",
					movements: movements.length,
				},
			}),
		]);
		if (!results[results.length - 2].meta.changes)
			throw new Error(`Order ${id} kept its status after its sale movements`);
		return c.json({ ok: true });
	})
	.post("/:id/deliver", validate("param", idParam), async (c) => {
		const db = getDb();
		const { id } = c.req.valid("param");
		const actor = c.var.adminUserId;
		const fulfilled = and(eq(orders.id, id), eq(orders.status, "fulfilled"));
		const stillFulfilled = db
			.select({ id: orders.id })
			.from(orders)
			.where(fulfilled);
		const results = await db.batch([
			audit(
				db,
				{
					actorUserId: actor,
					action: "order.status",
					entityType: "order",
					entityId: id,
					data: { from: "fulfilled", to: "delivered" },
				},
				stillFulfilled,
			),
			db
				.update(orders)
				.set({ status: "delivered", deliveredAt: now })
				.where(fulfilled),
		]);
		if (!results[results.length - 1].meta.changes)
			return invalidTransition(c, "deliver");
		return c.json({ ok: true });
	})
	// A fulfilled order is cancelled only when its delivery failed: a delivery_failed return
	// brings back every unit still out, in the same batch.
	.post(
		"/:id/cancel",
		validate("param", idParam),
		validate(
			"json",
			z.object({ reason: z.string().trim().min(1).max(200).optional() }),
		),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { reason } = c.req.valid("json");
			const actor = c.var.adminUserId;
			const order = await db.query.orders.findFirst({
				where: eq(orders.id, id),
			});
			if (!order) return c.json({ error: "not_found" }, 404);
			const from: OrderStatus = order.status;
			if (!canTransition(from, "cancelled"))
				return invalidTransition(c, "cancel");
			const unchanged = and(eq(orders.id, id), eq(orders.status, from));
			const stillAsRead = db
				.select({ id: orders.id })
				.from(orders)
				.where(unchanged);
			const { timeZone } = await getSettings(db);
			const plan =
				from === "fulfilled"
					? fullReturn(await soldLots(db, id), storeToday(timeZone))
					: [];
			const back =
				plan.length > 0
					? returnStatements(
							db,
							id,
							{ reason: "delivery_failed", note: reason ?? null },
							plan,
							actor,
							stillAsRead,
						)
					: null;
			const results = await db.batch([
				audit(
					db,
					{
						actorUserId: actor,
						action: "order.status",
						entityType: "order",
						entityId: id,
						data: {
							from,
							to: "cancelled",
							reason: reason ?? null,
							...(plan.length > 0 ? { returnedLines: plan } : {}),
						},
					},
					stillAsRead,
				),
				...(back ? [back.header, ...back.lines] : []),
				db
					.update(orders)
					.set({
						status: "cancelled",
						cancelledAt: now,
						cancelReason: reason ?? null,
					})
					.where(unchanged),
			]);
			// The last result is the status update (the return header's is a row list).
			const cancelled = results[results.length - 1];
			if (Array.isArray(cancelled))
				throw new Error(`Order ${id}: the cancel batch ended with a row list`);
			if (!cancelled.meta.changes) return invalidTransition(c, "cancel");
			return c.json({ ok: true });
		},
	)
	// The order keeps its status; the money goes back with POST /:id/refunds.
	.post(
		"/:id/returns",
		validate("param", idParam),
		validate("json", returnInput),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const input = c.req.valid("json");
			const actor = c.var.adminUserId;
			const order = await db.query.orders.findFirst({
				where: eq(orders.id, id),
			});
			if (!order) return c.json({ error: "not_found" }, 404);
			if (!(SHIPPED_STATUSES as readonly string[]).includes(order.status))
				return invalidTransition(c, "return");
			const { timeZone } = await getSettings(db);
			let plan: ReturnLinePlan[];
			try {
				plan = planReturn(
					await soldLots(db, id),
					input.lines,
					storeToday(timeZone),
				);
			} catch (e) {
				if (e instanceof ReturnExceedsSoldError)
					return c.json(
						{ error: "return_exceeds_sold", orderItemId: e.orderItemId },
						409,
					);
				if (e instanceof ReturnLotRequiredError)
					return c.json(
						{ error: "return_lot_required", orderItemId: e.orderItemId },
						400,
					);
				if (e instanceof RestockExpiredLotError)
					return c.json({ error: "restock_expired_lot", lotId: e.lotId }, 409);
				throw e;
			}
			const stillAsRead = db
				.select({ id: orders.id })
				.from(orders)
				.where(and(eq(orders.id, id), eq(orders.status, order.status)));
			const { header, lines } = returnStatements(
				db,
				id,
				{ reason: input.reason, note: input.note ?? null },
				plan,
				actor,
				stillAsRead,
			);
			// The audit row goes first: the return gets the next id.
			const [, inserted] = await db.batch([
				audit(
					db,
					{
						actorUserId: actor,
						action: "return.create",
						entityType: "return",
						entityId: nextId(returns),
						data: { orderId: id, reason: input.reason, lines: plan },
					},
					stillAsRead,
				),
				header,
				...lines,
			]);
			const [created] = inserted;
			if (!created) return invalidTransition(c, "return");
			return c.json({ ok: true, returnId: created.id }, 201);
		},
	);
