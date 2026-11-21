import { describe, expect, test } from "bun:test";
import { ORDER_STATUSES } from "#/db/schema";
import { canTransition, ORDER_TRANSITIONS } from "./order-state";

describe("order state machine", () => {
	test("follows pending, confirmed, fulfilled, delivered", () => {
		expect(canTransition("pending", "confirmed")).toBe(true);
		expect(canTransition("confirmed", "fulfilled")).toBe(true);
		expect(canTransition("fulfilled", "delivered")).toBe(true);
	});

	test("cancels before delivery only", () => {
		expect(canTransition("pending", "cancelled")).toBe(true);
		expect(canTransition("confirmed", "cancelled")).toBe(true);
		expect(canTransition("fulfilled", "cancelled")).toBe(true);
		expect(canTransition("delivered", "cancelled")).toBe(false);
	});

	test("never skips a step or goes back", () => {
		expect(canTransition("pending", "fulfilled")).toBe(false);
		expect(canTransition("confirmed", "delivered")).toBe(false);
		expect(canTransition("fulfilled", "confirmed")).toBe(false);
		expect(canTransition("cancelled", "pending")).toBe(false);
	});

	test("covers every status and ends in delivered or cancelled", () => {
		expect(Object.keys(ORDER_TRANSITIONS).sort()).toEqual(
			[...ORDER_STATUSES].sort(),
		);
		expect(ORDER_TRANSITIONS.delivered).toEqual([]);
		expect(ORDER_TRANSITIONS.cancelled).toEqual([]);
	});
});
