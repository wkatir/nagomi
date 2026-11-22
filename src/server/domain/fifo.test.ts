import { describe, expect, test } from "bun:test";
import { allocateFifo, InsufficientStockError } from "./fifo";

describe("allocateFifo", () => {
	test("takes the oldest lot first and moves on when it runs out", () => {
		expect(
			allocateFifo(
				[
					{ lotId: 3, available: 10 },
					{ lotId: 1, available: 2 },
					{ lotId: 2, available: 0 },
				],
				5,
			),
		).toEqual([
			{ lotId: 1, quantity: 2 },
			{ lotId: 3, quantity: 3 },
		]);
	});

	test("refuses to fulfil part of a line", () => {
		expect(() => allocateFifo([{ lotId: 1, available: 2 }], 3)).toThrow(
			InsufficientStockError,
		);
	});

	test("refuses a quantity that is not a positive whole number", () => {
		expect(() => allocateFifo([], 0)).toThrow("Invalid quantity");
		expect(() => allocateFifo([], 1.5)).toThrow("Invalid quantity");
	});
});
