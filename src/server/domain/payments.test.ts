import { describe, expect, test } from "bun:test";
import { amountOwed, paidAt, paymentSummary } from "./payments";

const order = {
	status: "delivered" as const,
	subtotal: 5800,
	discount: 300,
	shipping: 350,
	lines: [
		{ quantity: 1, unitPrice: 2400, returned: 0 },
		{ quantity: 2, unitPrice: 1700, returned: 0 },
	],
};

describe("amountOwed", () => {
	test("is the order total while nothing came back", () => {
		expect(amountOwed(order)).toBe(5850);
	});

	test("drops returned units and their share of the discount", () => {
		// Kept 4100 of 5800: discount 300 x 4100 / 5800 = 212.07 -> 212.
		const returned = {
			...order,
			lines: [
				{ quantity: 1, unitPrice: 2400, returned: 0 },
				{ quantity: 2, unitPrice: 1700, returned: 1 },
			],
		};
		expect(amountOwed(returned)).toBe(4100 - 212 + 350);
	});

	test("owes nothing when every unit came back or the order is cancelled", () => {
		const all = {
			...order,
			lines: order.lines.map((l) => ({ ...l, returned: l.quantity })),
		};
		expect(amountOwed(all)).toBe(0);
		expect(amountOwed({ ...order, status: "cancelled" })).toBe(0);
	});

	test("refuses impossible lines", () => {
		expect(() =>
			amountOwed({
				...order,
				lines: [{ quantity: 1, unitPrice: 1, returned: 2 }],
			}),
		).toThrow("Returned 2 of 1");
	});
});

describe("paymentSummary", () => {
	test("is unpaid, partially paid or paid by confirmed payments", () => {
		expect(paymentSummary(4000, 0, 0).status).toBe("unpaid");
		expect(paymentSummary(4000, 1000, 0)).toEqual({
			owed: 4000,
			paid: 1000,
			refunded: 0,
			net: 1000,
			balance: 3000,
			refundable: 0,
			status: "partially_paid",
		});
		expect(paymentSummary(4000, 4000, 0).status).toBe("paid");
	});

	test("reports a refund due when the store holds more than is owed", () => {
		expect(paymentSummary(4000, 4500, 0)).toMatchObject({
			status: "refund_due",
			balance: -500,
			refundable: 500,
		});
		// A cancelled or fully returned order that was paid.
		expect(paymentSummary(0, 4000, 0)).toMatchObject({
			status: "refund_due",
			refundable: 4000,
		});
	});

	test("reads paid again once an overpayment or a return is refunded", () => {
		expect(paymentSummary(4000, 4500, 500).status).toBe("paid");
		expect(paymentSummary(2300, 4000, 1700)).toMatchObject({
			status: "paid",
			refundable: 0,
		});
		expect(paymentSummary(0, 4000, 4000).status).toBe("refunded");
	});

	test("owes nothing when nothing is owed and nothing was paid", () => {
		expect(paymentSummary(0, 0, 0).status).toBe("nothing_due");
	});

	test("rejects impossible amounts", () => {
		expect(() => paymentSummary(4000, 1000, 2000)).toThrow("exceeds paid");
		expect(() => paymentSummary(4000, -1, 0)).toThrow("Invalid amounts");
		expect(() => paymentSummary(4000, 1.5, 0)).toThrow("Invalid amounts");
	});
});

describe("paidAt", () => {
	test("is when the payments first reached the total", () => {
		expect(
			paidAt(5850, [
				{ amount: 3000, recordedAt: "2026-10-06T10:00:00Z" },
				{ amount: 2850, recordedAt: "2026-10-07T09:00:00Z" },
				{ amount: 100, recordedAt: "2026-10-08T09:00:00Z" },
			]),
		).toBe("2026-10-07T09:00:00Z");
		expect(
			paidAt(5850, [
				{ amount: 2850, recordedAt: "2026-10-07T09:00:00Z" },
				{ amount: 3000, recordedAt: "2026-10-06T10:00:00Z" },
			]),
		).toBe("2026-10-07T09:00:00Z");
	});

	test("is null while short of the total, or when nothing is owed", () => {
		expect(
			paidAt(5850, [{ amount: 5849, recordedAt: "2026-10-06T10:00:00Z" }]),
		).toBeNull();
		expect(paidAt(5850, [])).toBeNull();
		expect(
			paidAt(0, [{ amount: 100, recordedAt: "2026-10-06T10:00:00Z" }]),
		).toBeNull();
	});
});
