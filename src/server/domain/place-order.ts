import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import type {
	Locale,
	OrderChannel,
	PaymentMethod,
	ShippingMethod,
} from "#/db/schema";
import { addDays, storeToday } from "#/lib/dates";
import type { CartLine, StockView } from "./cart";
import {
	allocateBundle,
	allocateLines,
	type CartTotals,
	type LineDemand,
} from "./cart-pricing";
import { confirmationMessage } from "./confirmation";
import type { CheckoutPage } from "./consents";
import { type CheckoutConsentInput, checkoutConsents } from "./consents";
import { insertIfExists } from "./d1";
import { lotStock } from "./inventory";
import { newOrderCode } from "./order-code";
import { phoneDigits, searchKey } from "./search";
import type { StoreSettings } from "./settings";

const {
	cartItems,
	carts,
	customerConsents,
	customers,
	inventoryMovements,
	lots,
	orderBundles,
	orderItems,
	orders,
	promotionRedemptions,
} = schema;

export type OrderLinePlan = {
	key: string;
	variantId: number;
	quantity: number;
	unitPrice: number;
	sku: string;
	brandName: string;
	productName: string;
	optionLabel: string | null;
	bundleId: number | null;
};

export type BundlePlan = {
	bundleId: number;
	quantity: number;
	unitPrice: number;
	name: string;
};

export function planLines(lines: CartLine[], view: StockView) {
	const items: OrderLinePlan[] = [];
	const sets: BundlePlan[] = [];
	for (const line of lines) {
		if (line.problem !== null || line.unitPrice === null)
			throw new Error(`Cart line ${line.id} cannot be ordered`);
		if (line.kind === "variant") {
			const p = view.products.find((x) => x.variantId === line.variantId);
			if (!p) throw new Error(`Variant ${line.variantId} vanished`);
			items.push({
				key: `v${p.variantId}`,
				variantId: p.variantId,
				quantity: line.quantity,
				unitPrice: p.price,
				sku: p.sku,
				brandName: p.brand,
				productName: p.name,
				optionLabel: p.optionLabel,
				bundleId: null,
			});
			continue;
		}
		const b = view.bundles.find((x) => x.id === line.bundleId);
		if (!b) throw new Error(`Set ${line.bundleId} vanished`);
		const shares = allocateBundle(
			b.price,
			b.items.map((i) => ({
				quantity: i.quantity,
				listPrice: i.product.price,
			})),
		);
		sets.push({
			bundleId: b.id,
			quantity: line.quantity,
			unitPrice: b.price,
			name: b.name,
		});
		b.items.forEach((i, k) => {
			items.push({
				key: `b${b.id}v${i.product.variantId}`,
				variantId: i.product.variantId,
				quantity: i.quantity * line.quantity,
				unitPrice: shares[k],
				sku: i.product.sku,
				brandName: i.product.brand,
				productName: i.product.name,
				optionLabel: i.product.optionLabel,
				bundleId: b.id,
			});
		});
	}
	return { items, sets };
}

export async function allocateStock(db: Db, items: OrderLinePlan[]) {
	const balances = await lotStock(
		db,
		inArray(lots.variantId, [...new Set(items.map((i) => i.variantId))]),
	);
	const demand: LineDemand[] = items.map((i) => ({
		key: i.key,
		variantId: i.variantId,
		quantity: i.quantity,
	}));
	return allocateLines(balances, demand);
}

export type PlaceOrderInput = {
	settings: StoreSettings;
	locale: Locale;
	channel: OrderChannel;
	idempotencyKey: string;
	requestHash: string;
	customer: {
		id: number | null;
		name: string;
		email: string;
		phone: string;
	};
	delivery: {
		method: ShippingMethod;
		zoneId: number;
		zoneName: string;
		department: string;
		municipality: string;
		addressLine: string;
		reference: string | null;
		daysMin: number;
		daysMax: number;
	};
	paymentMethod: PaymentMethod;
	totals: CartTotals & { shipping: number };
	promotion: { id: number; code: string; perCustomer: boolean } | null;
	items: OrderLinePlan[];
	sets: BundlePlan[];
	allocation: { key: string; taken: { lotId: number; quantity: number }[] }[];
	consents: CheckoutConsentInput;
	pageVersions: Record<CheckoutPage, number>;
	cartId: string | null;
	notes: string | null;
	createdBy: string;
};

// One D1 batch, one transaction. A retry with the same key inserts no order, so every
// guarded statement after it is skipped.
export function placeOrderStatements(db: Db, input: PlaceOrderInput) {
	const { settings, customer, delivery, totals } = input;
	const code = newOrderCode(settings.orderCodePrefix);
	const orderId = sql<number>`(select id from orders where code = ${code})`;
	const ours = db
		.select({ id: orders.id })
		.from(orders)
		.where(eq(orders.code, code));
	const keyFree = sql`(select 1 where not exists (select 1 from orders where idempotency_key = ${input.idempotencyKey}))`;
	const customerId =
		customer.id ??
		sql<number>`(select id from customers where email = ${customer.email})`;
	const today = storeToday(settings.timeZone);
	const estimate = {
		from: addDays(today, delivery.daysMin),
		to: addDays(today, delivery.daysMax),
	};
	const message = confirmationMessage({
		storeName: settings.name,
		code,
		locale: input.locale,
		countryCode: settings.countryCode,
		currency: settings.currency,
		lines: input.items,
		subtotal: totals.subtotal,
		discount: totals.discount,
		discountReason: input.promotion?.code ?? null,
		shipping: totals.shipping,
		shippingMethod: delivery.method,
		zoneName: delivery.zoneName,
		total: totals.total,
		paymentMethod: input.paymentMethod,
		delivery: estimate,
	});
	const bundleRow = (bundleId: number) =>
		sql<number>`(select id from order_bundles where order_id = ${orderId} and bundle_id = ${bundleId})`;
	const itemRow = (item: OrderLinePlan) =>
		item.bundleId === null
			? sql<number>`(select id from order_items where order_id = ${orderId} and variant_id = ${item.variantId} and order_bundle_id is null)`
			: sql<number>`(select id from order_items where order_bundle_id = ${bundleRow(item.bundleId)} and variant_id = ${item.variantId})`;

	const statements = [
		...(customer.id === null
			? [
					insertIfExists(
						db,
						customers,
						{
							name: customer.name,
							email: customer.email,
							phoneE164: sql<string>`(select ${customer.phone} where not exists (select 1 from customers where phone_e164 = ${customer.phone}))`,
							searchKey: searchKey(
								customer.name,
								customer.email,
								phoneDigits(customer.phone),
							),
						},
						keyFree,
					).onConflictDoUpdate({
						target: customers.email,
						targetWhere: sql`email is not null`,
						set: { name: sql`coalesce(${customers.name}, excluded.name)` },
					}),
				]
			: []),
		insertIfExists(
			db,
			orders,
			{
				code,
				idempotencyKey: input.idempotencyKey,
				requestHash: input.requestHash,
				customerId,
				customerName: customer.name,
				customerEmail: customer.email,
				customerPhone: customer.phone,
				searchKey: searchKey(
					code,
					customer.name,
					customer.email,
					phoneDigits(customer.phone),
				),
				locale: input.locale,
				channel: input.channel,
				paymentMethod: input.paymentMethod,
				subtotal: totals.subtotal,
				discount: totals.discount,
				discountReason: input.promotion?.code ?? null,
				shipping: totals.shipping,
				total: totals.total,
				taxIncluded: totals.taxIncluded,
				shippingMethod: delivery.method,
				shippingZoneId: delivery.zoneId,
				shippingZoneName: delivery.zoneName,
				shipDepartment: delivery.department,
				shipMunicipality: delivery.municipality,
				shipAddressLine: delivery.addressLine,
				shipReference: delivery.reference,
				deliveryEstimateFrom: estimate.from,
				deliveryEstimateTo: estimate.to,
				confirmationMessage: message,
				notes: input.notes,
				promotionId: input.promotion?.id ?? null,
			},
			keyFree,
		),
		...input.sets.map((s) =>
			insertIfExists(
				db,
				orderBundles,
				{
					orderId,
					bundleId: s.bundleId,
					quantity: s.quantity,
					unitPrice: s.unitPrice,
					name: s.name,
				},
				ours,
			),
		),
		...input.items.map((i) =>
			insertIfExists(
				db,
				orderItems,
				{
					orderId,
					variantId: i.variantId,
					orderBundleId: i.bundleId === null ? null : bundleRow(i.bundleId),
					quantity: i.quantity,
					unitPrice: i.unitPrice,
					sku: i.sku,
					brandName: i.brandName,
					productName: i.productName,
					optionLabel: i.optionLabel,
				},
				ours,
			),
		),
		...input.allocation.flatMap((a) => {
			const item = input.items.find((i) => i.key === a.key);
			if (!item) throw new Error(`Allocation for unknown line ${a.key}`);
			return a.taken.map((t) =>
				insertIfExists(
					db,
					inventoryMovements,
					{
						lotId: t.lotId,
						kind: "sale",
						quantity: -t.quantity,
						orderItemId: itemRow(item),
						createdBy: input.createdBy,
					},
					ours,
				),
			);
		}),
		...(input.promotion
			? [
					insertIfExists(
						db,
						promotionRedemptions,
						{
							promotionId: input.promotion.id,
							orderId,
							email: customer.email,
							customerKey: input.promotion.perCustomer ? customer.email : null,
						},
						ours,
					),
				]
			: []),
		...checkoutConsents(input.consents, input.pageVersions).map((consent) =>
			insertIfExists(
				db,
				customerConsents,
				{
					...consent,
					customerId: sql<number>`(select customer_id from orders where code = ${code})`,
					orderId,
					channel: input.channel,
				},
				ours,
			),
		),
		...(input.cartId
			? [
					db
						.delete(cartItems)
						.where(
							and(eq(cartItems.cartId, input.cartId), sql`exists ${ours}`),
						),
					db
						.update(carts)
						.set({ promotionCode: null })
						.where(and(eq(carts.id, input.cartId), sql`exists ${ours}`)),
				]
			: []),
	];
	return { code, statements };
}
