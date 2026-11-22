import { describe, expect, test } from "bun:test";
import { ORDER_STATUSES } from "#/db/schema";
import { canTransition, ORDER_TRANSITIONS } from "./order-state";

describe("order state machine", () => {
	test("follows pending, paid, shipped, delivered", () => {
		expect(canTransition("pending", "paid", "bank_transfer")).toBe(true);
		expect(canTransition("paid", "shipped", "bank_transfer")).toBe(true);
		expect(canTransition("shipped", "delivered", "bank_transfer")).toBe(true);
	});

	test("ships an unpaid order only when it is cash on delivery", () => {
		expect(canTransition("pending", "shipped", "cash_on_delivery")).toBe(true);
		expect(canTransition("pending", "shipped", "card")).toBe(false);
		expect(canTransition("pending", "shipped", "bank_transfer")).toBe(false);
	});

	test("cancels only pending or paid orders", () => {
		expect(canTransition("pending", "cancelled", "card")).toBe(true);
		expect(canTransition("paid", "cancelled", "card")).toBe(true);
		expect(canTransition("shipped", "cancelled", "card")).toBe(false);
		expect(canTransition("delivered", "cancelled", "card")).toBe(false);
	});

	test("never skips a step or goes back", () => {
		expect(canTransition("pending", "delivered", "cash_on_delivery")).toBe(
			false,
		);
		expect(canTransition("paid", "delivered", "card")).toBe(false);
		expect(canTransition("shipped", "paid", "card")).toBe(false);
		expect(canTransition("cancelled", "pending", "card")).toBe(false);
	});

	test("covers every status and ends in delivered or cancelled", () => {
		expect(Object.keys(ORDER_TRANSITIONS).sort()).toEqual(
			[...ORDER_STATUSES].sort(),
		);
		expect(ORDER_TRANSITIONS.delivered).toEqual([]);
		expect(ORDER_TRANSITIONS.cancelled).toEqual([]);
	});
});
