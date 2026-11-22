import { daysBetween } from "#/lib/dates";
import type { CustomerSegment, OrderStatus } from "#/lib/enums";
import { CUSTOMER_SEGMENTS, ORDER_STATUSES } from "#/lib/enums";

type Range = { from: string; to: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

export const rangeDays = (range: Range) =>
	daysBetween(range.from, range.to) + 1;

export function daysOnSale(firstSoldOn: string, range: Range): number {
	if (firstSoldOn > range.to)
		throw new Error(`First sale ${firstSoldOn} is after ${range.to}`);
	const start = firstSoldOn > range.from ? firstSoldOn : range.from;
	return daysBetween(start, range.to) + 1;
}

export const unitsPerDay = (units: number, days: number) =>
	round2(units / days);

export function stockTurnover({
	unitsSold,
	opening,
	closing,
	onHand,
	days,
}: {
	unitsSold: number;
	opening: number;
	closing: number;
	onHand: number;
	days: number;
}) {
	const average = (opening + closing) / 2;
	const rate = unitsSold / days;
	return {
		averageOnHand: round2(average),
		rotation: average === 0 ? null : round2(unitsSold / average),
		daysOfCover: rate === 0 ? null : Math.floor(onHand / rate),
	};
}

export type BoughtOrder = {
	orderId: number;
	customerId: number;
	createdAt: string;
	value: number;
};

export type Buyer = {
	customerId: number;
	name: string | null;
	email: string | null;
	segment: CustomerSegment | null;
	firstOrderAt: string;
};

export function customerActivity(
	orders: BoughtOrder[],
	buyers: Map<number, Buyer>,
	range: { start: string },
	segments: { segment: CustomerSegment | null; customers: number }[],
) {
	const byCustomer = new Map<
		number,
		{ orders: number; value: number; lastOrderAt: string }
	>();
	for (const o of orders) {
		const row = byCustomer.get(o.customerId) ?? {
			orders: 0,
			value: 0,
			lastOrderAt: o.createdAt,
		};
		row.orders += 1;
		row.value += o.value;
		if (o.createdAt > row.lastOrderAt) row.lastOrderAt = o.createdAt;
		byCustomer.set(o.customerId, row);
	}
	const rows = [...byCustomer].map(([customerId, row]) => {
		const buyer = buyers.get(customerId);
		if (!buyer) throw new Error(`Customer ${customerId} is not loaded`);
		return {
			customerId,
			name: buyer.name,
			email: buyer.email,
			segment: buyer.segment,
			isNew: buyer.firstOrderAt >= range.start,
			...row,
		};
	});
	const newBuyers = rows.filter((r) => r.isNew).length;
	const value = rows.reduce((n, r) => n + r.value, 0);
	const frequency = [
		{ orders: "1", buyers: rows.filter((r) => r.orders === 1).length },
		{ orders: "2", buyers: rows.filter((r) => r.orders === 2).length },
		{ orders: "3+", buyers: rows.filter((r) => r.orders >= 3).length },
	];
	const segmentCount = (segment: CustomerSegment) =>
		segments.find((s) => s.segment === segment)?.customers ?? 0;
	return {
		buyers: rows.length,
		newBuyers,
		returningBuyers: rows.length - newBuyers,
		orders: orders.length,
		value,
		ordersPerBuyer:
			rows.length === 0 ? null : round2(orders.length / rows.length),
		valuePerBuyer: rows.length === 0 ? null : Math.round(value / rows.length),
		frequency,
		segments: CUSTOMER_SEGMENTS.map((segment) => ({
			segment,
			customers: segmentCount(segment),
		})),
		topBuyers: rows
			.sort(
				(a, b) =>
					b.value - a.value ||
					b.orders - a.orders ||
					a.customerId - b.customerId,
			)
			.slice(0, 20),
	};
}

export type PlacedOrder = {
	id: number;
	code: string;
	customerName: string;
	status: OrderStatus;
	createdDay: string;
	createdAt: string;
	shippedAt: string | null;
	deliveredAt: string | null;
	deliveredDay: string | null;
	promisedBy: string | null;
	returned: boolean;
};

const HOUR = 3_600_000;
const hoursBetween = (from: string, to: string) =>
	(Date.parse(to) - Date.parse(from)) / HOUR;

const average = (values: number[]) =>
	values.length === 0
		? null
		: round2(values.reduce((a, b) => a + b, 0) / values.length);

function median(values: number[]) {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return round2(
		sorted.length % 2 === 1
			? (sorted[mid] as number)
			: ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2,
	);
}

export const DELIVERY_DAY_BUCKETS = ["0-1", "2", "3", "4", "5+"] as const;

const bucketOf = (days: number): (typeof DELIVERY_DAY_BUCKETS)[number] =>
	days <= 1 ? "0-1" : days >= 5 ? "5+" : (String(days) as "2" | "3" | "4");

export function fulfillment(orders: PlacedOrder[], today: string) {
	const delivered = orders.filter(
		(o): o is PlacedOrder & { deliveredAt: string; deliveredDay: string } =>
			o.status === "delivered" &&
			o.deliveredAt !== null &&
			o.deliveredDay !== null,
	);
	const deliveryDays = delivered.map((o) =>
		daysBetween(o.createdDay, o.deliveredDay),
	);
	const dispatchHours = orders
		.filter((o) => o.shippedAt !== null)
		.map((o) => hoursBetween(o.createdAt, o.shippedAt as string));
	const late = orders
		.filter((o) => o.promisedBy !== null && o.status !== "cancelled")
		.flatMap((o) => {
			const promisedBy = o.promisedBy as string;
			if (o.status === "delivered") {
				if (o.deliveredDay === null)
					throw new Error(`Order ${o.id} is delivered without a date`);
				return o.deliveredDay > promisedBy
					? [
							{
								...o,
								open: false,
								daysLate: daysBetween(promisedBy, o.deliveredDay),
							},
						]
					: [];
			}
			return today > promisedBy
				? [{ ...o, open: true, daysLate: daysBetween(promisedBy, today) }]
				: [];
		})
		.sort((a, b) => b.daysLate - a.daysLate || a.id - b.id);
	const withPromise = delivered.filter((o) => o.promisedBy !== null);
	const onTime = withPromise.filter(
		(o) => o.deliveredDay <= (o.promisedBy as string),
	).length;
	const shipped = orders.filter(
		(o) => o.status === "shipped" || o.status === "delivered",
	);
	const returnedOrders = shipped.filter((o) => o.returned).length;
	return {
		orders: orders.length,
		byStatus: ORDER_STATUSES.map((status) => ({
			status,
			orders: orders.filter((o) => o.status === status).length,
		})),
		delivered: delivered.length,
		averageDeliveryDays: average(deliveryDays),
		medianDeliveryDays: median(deliveryDays),
		averageDispatchHours: average(dispatchHours),
		deliveryDays: DELIVERY_DAY_BUCKETS.map((bucket) => ({
			bucket,
			orders: deliveryDays.filter((d) => bucketOf(d) === bucket).length,
		})),
		onTimeRate:
			withPromise.length === 0 ? null : round2(onTime / withPromise.length),
		lateOrders: late.length,
		lateOpen: late.filter((o) => o.open).length,
		late: late.slice(0, 50).map((o) => ({
			id: o.id,
			code: o.code,
			customerName: o.customerName,
			status: o.status,
			promisedBy: o.promisedBy as string,
			deliveredDay: o.deliveredDay,
			daysLate: o.daysLate,
		})),
		returnedOrders,
		returnRate:
			shipped.length === 0 ? null : round2(returnedOrders / shipped.length),
	};
}
