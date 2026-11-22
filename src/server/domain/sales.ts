import type { OrderStatus } from "#/db/schema";
import { groupBy } from "./group-by";
import { SHIPPED_STATUSES } from "./order-state";
import { amountOwed } from "./payments";
import { e4ToMinor } from "./receiving";

// A sale is dated by the local day its order was fulfilled, net of every return of its
// units. Costs are landed lot costs in `_e4` units, rounded to minor units only when a
// figure is reported.

export type SoldLine = {
	orderItemId: number;
	variantId: number;
	sku: string;
	brand: string;
	name: string;
	quantity: number;
	unitPrice: number;
	returned: number;
	soldCostE4: number;
	returnedCostE4: number;
};

export type SoldOrder = {
	id: number;
	day: string;
	status: OrderStatus;
	subtotal: number;
	discount: number;
	shipping: number;
	total: number;
	taxIncluded: number;
	lines: SoldLine[];
};

type LineSale = {
	orderId: number;
	orderItemId: number;
	variantId: number;
	sku: string;
	brand: string;
	name: string;
	day: string;
	unitsSold: number;
	unitsReturned: number;
	units: number;
	merchandise: number;
	costE4: number;
};

export type OrderSale = {
	orderId: number;
	day: string;
	revenue: number;
	tax: number;
	merchandise: number;
	shipping: number;
	costE4: number;
	lines: LineSale[];
};

// Largest-remainder method, so the parts add up exactly; ties go to the earlier weight.
export function splitByWeight(total: number, weights: number[]): number[] {
	if (!Number.isSafeInteger(total) || total < 0)
		throw new Error(`Invalid amount ${total}`);
	const sum = weights.reduce((a, b) => a + b, 0);
	if (sum === 0) {
		if (total !== 0) throw new Error(`Cannot split ${total} over no weight`);
		return weights.map(() => 0);
	}
	const big = BigInt(total);
	const parts = weights.map((w, index) => ({
		index,
		base: (big * BigInt(w)) / BigInt(sum),
		remainder: (big * BigInt(w)) % BigInt(sum),
	}));
	let left = big - parts.reduce((a, p) => a + p.base, 0n);
	for (const p of [...parts].sort((a, b) =>
		a.remainder === b.remainder
			? a.index - b.index
			: a.remainder > b.remainder
				? -1
				: 1,
	)) {
		if (left === 0n) break;
		p.base += 1n;
		left -= 1n;
	}
	return parts.map((p) => Number(p.base));
}

export function keptTax(
	order: { total: number; taxIncluded: number },
	revenue: number,
): number {
	if (revenue === order.total) return order.taxIncluded;
	if (order.total === 0) throw new Error("An order without total kept revenue");
	return Math.round((order.taxIncluded * revenue) / order.total);
}

// The discount the order keeps is spread over its lines by kept value, so line figures add
// up to the order's.
export function orderSale(order: SoldOrder): OrderSale {
	if (!(SHIPPED_STATUSES as readonly OrderStatus[]).includes(order.status))
		throw new Error(`Order ${order.id} (${order.status}) is not a sale`);
	const revenue = amountOwed(order);
	const kept = order.lines.map((l) => (l.quantity - l.returned) * l.unitPrice);
	const keptValue = kept.reduce((a, b) => a + b, 0);
	const shipping = keptValue > 0 ? order.shipping : 0;
	const merchandise = revenue - shipping;
	const discounts = splitByWeight(keptValue - merchandise, kept);
	const lines = order.lines.map((l, i) => ({
		orderId: order.id,
		orderItemId: l.orderItemId,
		variantId: l.variantId,
		sku: l.sku,
		brand: l.brand,
		name: l.name,
		day: order.day,
		unitsSold: l.quantity,
		unitsReturned: l.returned,
		units: l.quantity - l.returned,
		merchandise: kept[i] - discounts[i],
		costE4: l.soldCostE4 - l.returnedCostE4,
	}));
	return {
		orderId: order.id,
		day: order.day,
		revenue,
		tax: keptTax(order, revenue),
		merchandise,
		shipping,
		costE4: lines.reduce((n, l) => n + l.costE4, 0),
		lines,
	};
}

type SalesFigures = {
	orders: number;
	units: number;
	revenue: number;
	tax: number;
	netRevenue: number;
	averageTicket: number | null;
	merchandise: number;
	shipping: number;
	costOfGoodsSold: number;
	grossProfit: number;
	// grossProfit / merchandise, 4 decimals; null without merchandise.
	margin: number | null;
};

const ratio = (part: number, whole: number) =>
	whole === 0 ? null : Math.round((part / whole) * 10_000) / 10_000;

type Acc = {
	orders: Set<number>;
	units: number;
	revenue: number;
	tax: number;
	merchandise: number;
	shipping: number;
	costE4: number;
};

const emptyAcc = (): Acc => ({
	orders: new Set(),
	units: 0,
	revenue: 0,
	tax: 0,
	merchandise: 0,
	shipping: 0,
	costE4: 0,
});

function figures(acc: Acc): SalesFigures {
	const costOfGoodsSold = e4ToMinor(acc.costE4);
	const grossProfit = acc.merchandise - costOfGoodsSold;
	return {
		orders: acc.orders.size,
		units: acc.units,
		revenue: acc.revenue,
		tax: acc.tax,
		netRevenue: acc.revenue - acc.tax,
		averageTicket:
			acc.orders.size === 0 ? null : Math.round(acc.revenue / acc.orders.size),
		merchandise: acc.merchandise,
		shipping: acc.shipping,
		costOfGoodsSold,
		grossProfit,
		margin: ratio(grossProfit, acc.merchandise),
	};
}

// Shipping fees are revenue but not product margin.
export function salesTotals(sales: OrderSale[]): SalesFigures {
	const acc = emptyAcc();
	for (const s of sales) {
		acc.orders.add(s.orderId);
		acc.revenue += s.revenue;
		acc.tax += s.tax;
		acc.merchandise += s.merchandise;
		acc.shipping += s.shipping;
		acc.costE4 += s.costE4;
		acc.units += s.lines.reduce((n, l) => n + l.units, 0);
	}
	return figures(acc);
}

export function salesByOrderKey<K>(
	sales: OrderSale[],
	key: (s: OrderSale) => K,
): Map<K, SalesFigures> {
	return new Map([...groupBy(sales, key)].map(([k, g]) => [k, salesTotals(g)]));
}

type ProductSales = {
	variantId: number;
	sku: string;
	brand: string;
	name: string;
	orders: number;
	unitsSold: number;
	unitsReturned: number;
	units: number;
	merchandise: number;
	costOfGoodsSold: number;
	grossProfit: number;
	margin: number | null;
};

type LineAcc = {
	orders: Set<number>;
	variants: Set<number>;
	unitsSold: number;
	unitsReturned: number;
	units: number;
	merchandise: number;
	costE4: number;
};

function lineFigures(acc: LineAcc) {
	const costOfGoodsSold = e4ToMinor(acc.costE4);
	const grossProfit = acc.merchandise - costOfGoodsSold;
	return {
		orders: acc.orders.size,
		unitsSold: acc.unitsSold,
		unitsReturned: acc.unitsReturned,
		units: acc.units,
		merchandise: acc.merchandise,
		costOfGoodsSold,
		grossProfit,
		margin: ratio(grossProfit, acc.merchandise),
	};
}

function groupLines<K>(sales: OrderSale[], key: (l: LineSale) => K) {
	const groups = new Map<K, { acc: LineAcc; latest: LineSale }>();
	for (const line of sales.flatMap((s) => s.lines)) {
		const k = key(line);
		const group = groups.get(k) ?? {
			acc: {
				orders: new Set<number>(),
				variants: new Set<number>(),
				unitsSold: 0,
				unitsReturned: 0,
				units: 0,
				merchandise: 0,
				costE4: 0,
			},
			latest: line,
		};
		group.acc.orders.add(line.orderId);
		group.acc.variants.add(line.variantId);
		group.acc.unitsSold += line.unitsSold;
		group.acc.unitsReturned += line.unitsReturned;
		group.acc.units += line.units;
		group.acc.merchandise += line.merchandise;
		group.acc.costE4 += line.costE4;
		if (line.orderId > group.latest.orderId) group.latest = line;
		groups.set(k, group);
	}
	return [...groups.values()];
}

const byMerchandise = (
	a: { merchandise: number; units: number },
	b: { merchandise: number; units: number },
) => b.merchandise - a.merchandise || b.units - a.units;

// Named as last sold (order line snapshot).
export function salesByProduct(sales: OrderSale[]): ProductSales[] {
	return groupLines(sales, (l) => l.variantId)
		.map(({ acc, latest }) => ({
			variantId: latest.variantId,
			sku: latest.sku,
			brand: latest.brand,
			name: latest.name,
			...lineFigures(acc),
		}))
		.sort(byMerchandise);
}

type BrandSales = Omit<ProductSales, "variantId" | "sku" | "name"> & {
	products: number;
};

// As written on the order lines.
export function salesByBrand(sales: OrderSale[]): BrandSales[] {
	return groupLines(sales, (l) => l.brand)
		.map(({ acc, latest }) => ({
			brand: latest.brand,
			products: acc.variants.size,
			...lineFigures(acc),
		}))
		.sort(byMerchandise);
}
