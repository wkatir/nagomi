import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import type { Locale } from "#/db/schema";
import { storeToday } from "#/lib/dates";
import type { CardProvider } from "../payments/demo-card";
import { cartTotals, type PaymentOption, paymentOptions } from "./cart-pricing";
import {
	type CatalogBundle,
	type CatalogProduct,
	listBundles,
	listCatalog,
	pickLocale,
} from "./catalog";
import { nonEmpty } from "./d1";
import { sellableByVariant } from "./inventory";
import { promotionByCode } from "./promotion-queries";
import {
	evaluatePromotion,
	normalizeCode,
	type PromotionRefusal,
} from "./promotions";
import {
	getPaymentOptions,
	StoreNotConfiguredError,
	type StoreSettings,
} from "./settings";
import { zoneFee, zoneForMunicipality } from "./shipping";
import { catalogContext } from "./storefront-catalog";
import { zoneOptions } from "./zone-queries";

const { cartItems, carts } = schema;

export const CART_COOKIE = "nagomi_cart";
export const CART_COOKIE_DAYS = 60;

export function newCartId() {
	return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}

export const isCartId = (value: string | undefined): value is string =>
	value !== undefined && /^[0-9a-f]{32}$/.test(value);

export type CartRecord = typeof carts.$inferSelect;

export async function cartById(db: Db, id: string) {
	return (await db.query.carts.findFirst({ where: eq(carts.id, id) })) ?? null;
}

export async function cartOfCustomer(db: Db, customerId: number) {
	return (
		(await db.query.carts.findFirst({
			where: eq(carts.customerId, customerId),
		})) ?? null
	);
}

export function itemsOf(db: Db, cartId: string) {
	return db
		.select()
		.from(cartItems)
		.where(eq(cartItems.cartId, cartId))
		.orderBy(asc(cartItems.id));
}

type Item = typeof cartItems.$inferSelect;

export type StockView = {
	products: CatalogProduct[];
	bundles: (CatalogBundle & { id: number })[];
	sellable: Map<number, number>;
};

export async function stockView(
	db: Db,
	settings: StoreSettings,
	locale: Locale,
	items: Pick<Item, "variantId" | "bundleId">[],
): Promise<StockView> {
	const context = catalogContext(settings, locale);
	const variantIds = items.flatMap((i) => (i.variantId ? [i.variantId] : []));
	const wantsBundles = items.some((i) => i.bundleId !== null);
	const [products, bundles] = await Promise.all([
		variantIds.length ? listCatalog(db, context, { variantIds }) : [],
		wantsBundles ? listBundles(db, context) : [],
	]);
	const components = bundles.flatMap((b) =>
		b.items.map((i) => i.product.variantId),
	);
	const sellable = await sellableByVariant(db, [
		...new Set([...variantIds, ...components]),
	]);
	return { products, bundles, sellable };
}

function demandOf(item: Item, view: StockView) {
	if (item.variantId !== null)
		return new Map([[item.variantId, item.quantity]]);
	const bundle = view.bundles.find((b) => b.id === item.bundleId);
	if (!bundle) return new Map<number, number>();
	return new Map(
		bundle.items.map((i) => [i.product.variantId, i.quantity * item.quantity]),
	);
}

export function itemMax(
	item: Pick<Item, "id" | "variantId" | "bundleId">,
	others: Item[],
	view: StockView,
	maxPerLine: number,
) {
	const taken = new Map<number, number>();
	for (const o of others) {
		if (o.id === item.id) continue;
		for (const [v, q] of demandOf(o, view))
			taken.set(v, (taken.get(v) ?? 0) + q);
	}
	const free = (variantId: number) =>
		Math.max(
			0,
			(view.sellable.get(variantId) ?? 0) - (taken.get(variantId) ?? 0),
		);
	if (item.variantId !== null)
		return Math.min(maxPerLine, free(item.variantId));
	const bundle = view.bundles.find((b) => b.id === item.bundleId);
	if (!bundle) return 0;
	return Math.min(
		maxPerLine,
		...bundle.items.map((i) =>
			Math.floor(free(i.product.variantId) / i.quantity),
		),
	);
}

export type CartLineProblem = "unavailable" | "beyond_stock";

export type CartLine = {
	id: number;
	kind: "variant" | "bundle";
	variantId: number | null;
	bundleId: number | null;
	sku: string | null;
	slug: string | null;
	name: string | null;
	brand: string | null;
	optionLabel: string | null;
	image: { url: string; width: number; height: number; alt: string } | null;
	unitPrice: number | null;
	// For a set: what its items cost one by one.
	listPrice: number | null;
	quantity: number;
	lineTotal: number;
	maxQuantity: number;
	availability: "in_stock" | "sold_out";
	components: { sku: string; name: string; quantity: number }[];
	problem: CartLineProblem | null;
};

export function cartLines(
	items: Item[],
	view: StockView,
	maxPerLine: number,
): CartLine[] {
	return items.map((item): CartLine => {
		const max = itemMax(item, items, view, maxPerLine);
		const base = {
			id: item.id,
			variantId: item.variantId,
			bundleId: item.bundleId,
			quantity: item.quantity,
			maxQuantity: max,
			availability: max > 0 ? ("in_stock" as const) : ("sold_out" as const),
		};
		if (item.variantId !== null) {
			const p = view.products.find((x) => x.variantId === item.variantId);
			if (!p)
				return {
					...base,
					kind: "variant",
					sku: null,
					slug: null,
					name: null,
					brand: null,
					optionLabel: null,
					image: null,
					unitPrice: null,
					listPrice: null,
					lineTotal: 0,
					components: [],
					problem: "unavailable",
				};
			const image =
				p.images.find((i) => i.kind === "packshot") ?? p.images[0] ?? null;
			return {
				...base,
				kind: "variant",
				sku: p.sku,
				slug: p.slug,
				name: p.name,
				brand: p.brand,
				optionLabel: p.optionLabel,
				image: image
					? {
							url: image.url,
							width: image.width,
							height: image.height,
							alt: image.alt,
						}
					: null,
				unitPrice: p.price,
				listPrice: p.compareAtPrice,
				lineTotal: p.price * item.quantity,
				components: [],
				problem: item.quantity > max ? "beyond_stock" : null,
			};
		}
		const b = view.bundles.find((x) => x.id === item.bundleId);
		if (!b)
			return {
				...base,
				kind: "bundle",
				sku: null,
				slug: null,
				name: null,
				brand: null,
				optionLabel: null,
				image: null,
				unitPrice: null,
				listPrice: null,
				lineTotal: 0,
				components: [],
				problem: "unavailable",
			};
		const first = b.items[0]?.product;
		const image =
			first?.images.find((i) => i.kind === "packshot") ??
			first?.images[0] ??
			null;
		return {
			...base,
			kind: "bundle",
			sku: null,
			slug: b.slug,
			name: b.name,
			brand: null,
			optionLabel: null,
			image: image
				? {
						url: image.url,
						width: image.width,
						height: image.height,
						alt: image.alt,
					}
				: null,
			unitPrice: b.price,
			listPrice: b.itemsTotal,
			lineTotal: b.price * item.quantity,
			components: b.items.map((i) => ({
				sku: i.product.sku,
				name: `${i.product.brand} ${i.product.name}`,
				quantity: i.quantity,
			})),
			problem: item.quantity > max ? "beyond_stock" : null,
		};
	});
}

export type CouponState =
	| {
			code: string;
			valid: true;
			discount: number;
			description: string | null;
			emailCheckPending: boolean;
	  }
	| {
			code: string;
			valid: false;
			reason: PromotionRefusal;
			minSubtotal: number | null;
	  };

export async function evaluateCoupon(
	db: Db,
	settings: StoreSettings,
	locale: Locale,
	input: { code: string; email: string | null; subtotal: number },
): Promise<
	CouponState & {
		promotion?: { id: number; code: string; perCustomer: boolean };
	}
> {
	const code = normalizeCode(input.code);
	if (!code)
		return {
			code: input.code,
			valid: false,
			reason: "not_found",
			minSubtotal: null,
		};
	const found = await promotionByCode(db, code, input.email, {
		locale,
		fallback: settings.defaultLocale,
	});
	if (!found)
		return { code, valid: false, reason: "not_found", minSubtotal: null };
	const result = evaluatePromotion(found.promotion, {
		subtotal: input.subtotal,
		today: storeToday(settings.timeZone),
		usage: found.usage,
	});
	if (!result.ok)
		return {
			code,
			valid: false,
			reason: result.reason,
			minSubtotal:
				result.reason === "min_subtotal_not_met"
					? found.promotion.minSubtotal
					: null,
		};
	return {
		code,
		valid: true,
		discount: result.discount,
		description: found.description,
		emailCheckPending: result.emailCheckPending,
		promotion: {
			id: found.promotion.id,
			code,
			perCustomer: found.promotion.perCustomerLimit !== null,
		},
	};
}

export type ShippingQuote = {
	zoneId: number;
	zone: string;
	name: string;
	method: "pickup" | "own_delivery" | "courier";
	fee: number;
	baseFee: number;
	deliveryDaysMin: number;
	deliveryDaysMax: number;
};

export async function shippingQuote(
	db: Db,
	settings: StoreSettings,
	locale: Locale,
	municipality: string,
	merchandise: number,
): Promise<ShippingQuote | null> {
	const zones = await zoneOptions(db);
	const zone = zoneForMunicipality(
		zones
			.filter((z) => z.method !== "pickup")
			.map((z) => ({
				zone: z,
				coversRest: z.coversRest,
				municipalities: z.municipalities,
			})),
		municipality,
	);
	if (!zone) return null;
	const name = pickLocale(zone.translations, locale, settings.defaultLocale);
	if (!name)
		throw new Error(
			`Shipping zone ${zone.slug} has no ${settings.defaultLocale} name`,
		);
	return {
		zoneId: zone.id,
		zone: zone.slug,
		name: name.name,
		method: zone.method,
		fee: zoneFee(zone, merchandise, settings.freeShippingFrom),
		baseFee: zone.fee,
		deliveryDaysMin: zone.deliveryDaysMin,
		deliveryDaysMax: zone.deliveryDaysMax,
	};
}

export const bankConfigured = (settings: StoreSettings) =>
	settings.demoStore ||
	[
		settings.bankName,
		settings.bankAccountType,
		settings.bankAccountNumber,
		settings.bankAccountHolder,
	].every((v) => Boolean(v?.trim()));

export type PricedCart = Awaited<ReturnType<typeof priceCartWithStock>>["cart"];

export const priceCart = async (
	...args: Parameters<typeof priceCartWithStock>
) => (await priceCartWithStock(...args)).cart;

// Recomputed from the catalogue on every read: the browser never sends a price.
export async function priceCartWithStock(
	db: Db,
	settings: StoreSettings,
	locale: Locale,
	cart: Pick<CartRecord, "id" | "promotionCode"> | null,
	options: {
		municipality: string | null;
		email: string | null;
		cardProvider: CardProvider | null;
	},
) {
	const taxRateBp = settings.taxRateBp;
	if (taxRateBp === null) throw new StoreNotConfiguredError(["taxRateBp"]);
	const items = cart ? await itemsOf(db, cart.id) : [];
	const view = await stockView(db, settings, locale, items);
	const lines = cartLines(items, view, settings.maxQuantityPerLine);
	const subtotal = lines.reduce((n, l) => n + l.lineTotal, 0);
	const coupon =
		cart?.promotionCode && items.length > 0
			? await evaluateCoupon(db, settings, locale, {
					code: cart.promotionCode,
					email: options.email,
					subtotal,
				})
			: null;
	const discount = coupon?.valid ? coupon.discount : 0;
	const quote =
		options.municipality && items.length > 0
			? await shippingQuote(
					db,
					settings,
					locale,
					options.municipality,
					subtotal - discount,
				)
			: null;
	const totals = cartTotals({
		subtotal,
		discount,
		shipping: quote ? quote.fee : null,
		taxRateBp,
	});
	const [accepted, zones] = await Promise.all([
		getPaymentOptions(db),
		zoneOptions(db),
	]);
	const zoneName = (slug: string | null) => {
		const zone = zones.find((z) => z.slug === slug);
		return zone
			? (pickLocale(zone.translations, locale, settings.defaultLocale)?.name ??
					null)
			: null;
	};
	const payment = paymentOptions(accepted, {
		total: totals.total,
		zoneId: quote?.zoneId ?? null,
		cardProvider: options.cardProvider,
		bankConfigured: bankConfigured(settings),
	}).map((o: PaymentOption) => ({ ...o, zoneName: zoneName(o.zone) }));
	const freeFrom = settings.freeShippingFrom;
	const shownCoupon: CouponState | null = coupon
		? (({ promotion: _, ...rest }) => rest)(coupon)
		: null;
	const priced = {
		lines,
		count: lines.reduce((n, l) => n + l.quantity, 0),
		hasProblems: lines.some((l) => l.problem !== null),
		...totals,
		taxRateBp,
		coupon: shownCoupon,
		municipality: options.municipality,
		shippingQuote: quote,
		noShippingZone:
			options.municipality !== null && items.length > 0 && quote === null,
		freeShippingFrom: freeFrom,
		freeShippingGap:
			freeFrom === null ? null : Math.max(0, freeFrom - (subtotal - discount)),
		paymentOptions: payment,
	};
	return {
		cart: priced,
		view,
		items,
		promotion: coupon?.valid ? coupon.promotion : undefined,
	};
}

export async function mergeInto(
	db: Db,
	settings: StoreSettings,
	fromId: string,
	intoId: string,
) {
	const [from, into] = await Promise.all([
		itemsOf(db, fromId),
		itemsOf(db, intoId),
	]);
	const view = await stockView(db, settings, settings.defaultLocale, [
		...from,
		...into,
	]);
	const merged = [...into];
	const writes = [];
	for (const g of from) {
		const same = merged.find(
			(i) =>
				(g.variantId !== null && i.variantId === g.variantId) ||
				(g.bundleId !== null && i.bundleId === g.bundleId),
		);
		const probe = same ?? { ...g, id: -g.id, cartId: intoId, quantity: 0 };
		const max = itemMax(probe, merged, view, settings.maxQuantityPerLine);
		const quantity = Math.min(max, probe.quantity + g.quantity);
		if (same) {
			if (quantity > same.quantity) {
				writes.push(
					db
						.update(cartItems)
						.set({ quantity })
						.where(eq(cartItems.id, same.id)),
				);
				same.quantity = quantity;
			}
		} else if (quantity > 0) {
			writes.push(
				db.insert(cartItems).values({
					cartId: intoId,
					variantId: g.variantId,
					bundleId: g.bundleId,
					quantity,
				}),
			);
			merged.push({ ...probe, quantity });
		}
	}
	const guestPromotion = (await cartById(db, fromId))?.promotionCode ?? null;
	await db.batch(
		nonEmpty([
			...writes,
			...(guestPromotion
				? [
						db
							.update(carts)
							.set({ promotionCode: guestPromotion })
							.where(and(eq(carts.id, intoId), isNull(carts.promotionCode))),
					]
				: []),
			db
				.update(carts)
				.set({ updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))` })
				.where(eq(carts.id, intoId)),
			db.delete(cartItems).where(eq(cartItems.cartId, fromId)),
			db
				.delete(carts)
				.where(and(eq(carts.id, fromId), isNull(carts.customerId))),
		]),
	);
}
