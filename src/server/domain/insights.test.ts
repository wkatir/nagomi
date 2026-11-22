import { describe, expect, test } from "bun:test";
import {
	type Buyer,
	customerActivity,
	daysOnSale,
	fulfillment,
	type PlacedOrder,
	stockTurnover,
	unitsPerDay,
} from "./insights";

const range = { from: "2026-11-01", to: "2026-11-30" };

describe("units per day since the first sale", () => {
	test("a product first sold mid-range is measured from that day", () => {
		expect(daysOnSale("2026-11-21", range)).toBe(10);
		expect(unitsPerDay(5, daysOnSale("2026-11-21", range))).toBe(0.5);
	});

	test("an older product is measured over the whole range", () => {
		expect(daysOnSale("2026-01-10", range)).toBe(30);
		expect(unitsPerDay(10, 30)).toBe(0.33);
	});

	test("a first sale after the range is a bug", () => {
		expect(() => daysOnSale("2026-12-01", range)).toThrow();
	});
});

describe("stockTurnover", () => {
	test("units sold over the average stock, and days the stock lasts", () => {
		expect(
			stockTurnover({
				unitsSold: 30,
				opening: 25,
				closing: 15,
				onHand: 15,
				days: 30,
			}),
		).toEqual({ averageOnHand: 20, rotation: 1.5, daysOfCover: 15 });
	});

	test("without stock or without sales there is no ratio", () => {
		expect(
			stockTurnover({
				unitsSold: 0,
				opening: 0,
				closing: 0,
				onHand: 0,
				days: 7,
			}),
		).toEqual({ averageOnHand: 0, rotation: null, daysOfCover: null });
	});
});

describe("customerActivity", () => {
	const buyer = (customerId: number, firstOrderAt: string): Buyer => ({
		customerId,
		name: `C${customerId}`,
		email: `c${customerId}@example.com`,
		segment: "occasional",
		firstOrderAt,
	});
	const buyers = new Map([
		[1, buyer(1, "2026-11-02T10:00:00Z")],
		[2, buyer(2, "2026-05-02T10:00:00Z")],
		[3, buyer(3, "2026-11-05T10:00:00Z")],
	]);
	const order = (orderId: number, customerId: number, value: number) => ({
		orderId,
		customerId,
		createdAt: `2026-11-${String(orderId + 1).padStart(2, "0")}T12:00:00Z`,
		value,
	});
	const activity = customerActivity(
		[
			order(1, 1, 1000),
			order(2, 2, 3000),
			order(3, 2, 2000),
			order(4, 2, 500),
			order(5, 3, 800),
		],
		buyers,
		{ start: "2026-11-01T06:00:00Z" },
		[
			{ segment: "frequent", customers: 1 },
			{ segment: "new", customers: 4 },
		],
	);

	test("new buyers bought for the first time in the range", () => {
		expect(activity).toMatchObject({
			buyers: 3,
			newBuyers: 2,
			returningBuyers: 1,
			orders: 5,
			value: 7300,
			ordersPerBuyer: 1.67,
			valuePerBuyer: 2433,
		});
	});

	test("how often each buyer came back, and every segment", () => {
		expect(activity.frequency).toEqual([
			{ orders: "1", buyers: 2 },
			{ orders: "2", buyers: 0 },
			{ orders: "3+", buyers: 1 },
		]);
		expect(activity.segments).toEqual([
			{ segment: "new", customers: 4 },
			{ segment: "occasional", customers: 0 },
			{ segment: "frequent", customers: 1 },
			{ segment: "inactive", customers: 0 },
		]);
		expect(activity.topBuyers.map((b) => b.customerId)).toEqual([2, 1, 3]);
	});
});

describe("fulfillment", () => {
	const placed = (o: Partial<PlacedOrder> & { id: number }): PlacedOrder => ({
		code: `N-${o.id}`,
		customerName: "Ana",
		status: "pending",
		createdDay: "2026-11-10",
		createdAt: "2026-11-10T16:00:00Z",
		shippedAt: null,
		deliveredAt: null,
		deliveredDay: null,
		promisedBy: "2026-11-12",
		returned: false,
		...o,
	});
	const report = fulfillment(
		[
			placed({
				id: 1,
				status: "delivered",
				shippedAt: "2026-11-11T16:00:00Z",
				deliveredAt: "2026-11-12T20:00:00Z",
				deliveredDay: "2026-11-12",
			}),
			placed({
				id: 2,
				status: "delivered",
				shippedAt: "2026-11-10T22:00:00Z",
				deliveredAt: "2026-11-15T20:00:00Z",
				deliveredDay: "2026-11-15",
				returned: true,
			}),
			placed({ id: 3, status: "shipped", shippedAt: "2026-11-11T04:00:00Z" }),
			placed({ id: 4, status: "cancelled" }),
			placed({ id: 5, status: "paid", promisedBy: "2026-11-30" }),
		],
		"2026-11-20",
	);

	test("orders per status and how long a delivery takes", () => {
		expect(report.byStatus).toEqual([
			{ status: "pending", orders: 0 },
			{ status: "paid", orders: 1 },
			{ status: "shipped", orders: 1 },
			{ status: "delivered", orders: 2 },
			{ status: "cancelled", orders: 1 },
		]);
		expect(report).toMatchObject({
			delivered: 2,
			averageDeliveryDays: 3.5,
			medianDeliveryDays: 3.5,
			averageDispatchHours: 14,
			onTimeRate: 0.5,
			returnedOrders: 1,
			returnRate: 0.33,
		});
		expect(report.deliveryDays).toEqual([
			{ bucket: "0-1", orders: 0 },
			{ bucket: "2", orders: 1 },
			{ bucket: "3", orders: 0 },
			{ bucket: "4", orders: 0 },
			{ bucket: "5+", orders: 1 },
		]);
	});

	test("late: delivered after the promise, or still open past it", () => {
		expect(report.late.map((o) => [o.id, o.daysLate])).toEqual([
			[3, 8],
			[2, 3],
		]);
		expect(report).toMatchObject({ lateOrders: 2, lateOpen: 1 });
	});
});
