import { describe, expect, test } from "bun:test";
import type { AdminOrder } from "#/lib/api";
import { canReturn } from "./order-actions";

const detail = (status: string, lines: [number, number][]) =>
	({
		order: { status },
		lines: lines.map(([quantity, returned]) => ({ quantity, returned })),
	}) as unknown as AdminOrder;

describe("canReturn", () => {
	test("only a shipped order can have units come back", () => {
		for (const status of ["pending", "paid", "cancelled"])
			expect(canReturn(detail(status, [[2, 0]]))).toBe(false);
		for (const status of ["shipped", "delivered"])
			expect(canReturn(detail(status, [[2, 0]]))).toBe(true);
	});

	test("while at least one unit is left to return", () => {
		expect(canReturn(detail("delivered", [[2, 1]]))).toBe(true);
		expect(
			canReturn(
				detail("delivered", [
					[2, 2],
					[1, 0],
				]),
			),
		).toBe(true);
		expect(
			canReturn(
				detail("delivered", [
					[2, 2],
					[1, 1],
				]),
			),
		).toBe(false);
	});
});
