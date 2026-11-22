import { describe, expect, test } from "bun:test";
import {
	fullReturn,
	planReturn,
	ReturnExceedsSoldError,
	ReturnLotRequiredError,
	returnMovements,
} from "./returns";

// Order item 10 left from lots 1 (2 units) and 2 (1 unit); item 11 from lot 3 (3 units),
// one of which already came back.
const sold = [
	{ orderItemId: 10, lotId: 1, sold: 2, returned: 0 },
	{ orderItemId: 10, lotId: 2, sold: 1, returned: 0 },
	{ orderItemId: 11, lotId: 3, sold: 3, returned: 1 },
];

describe("planReturn", () => {
	test("uses the only lot a line left from", () => {
		expect(
			planReturn(sold, [
				{ orderItemId: 11, quantity: 2, disposition: "restock" },
			]),
		).toEqual([
			{ orderItemId: 11, lotId: 3, quantity: 2, disposition: "restock" },
		]);
	});

	test("needs the lot when a line left from several", () => {
		expect(() =>
			planReturn(sold, [
				{ orderItemId: 10, quantity: 1, disposition: "restock" },
			]),
		).toThrow(ReturnLotRequiredError);
		expect(
			planReturn(sold, [
				{ orderItemId: 10, lotId: 2, quantity: 1, disposition: "write_off" },
			]),
		).toEqual([
			{ orderItemId: 10, lotId: 2, quantity: 1, disposition: "write_off" },
		]);
	});

	test("never returns more than sold minus already returned", () => {
		expect(() =>
			planReturn(sold, [
				{ orderItemId: 11, quantity: 3, disposition: "restock" },
			]),
		).toThrow(ReturnExceedsSoldError);
		expect(() =>
			planReturn(sold, [
				{ orderItemId: 11, quantity: 1, disposition: "restock" },
				{ orderItemId: 11, quantity: 2, disposition: "write_off" },
			]),
		).toThrow(ReturnExceedsSoldError);
		expect(() =>
			planReturn(sold, [
				{ orderItemId: 99, quantity: 1, disposition: "restock" },
			]),
		).toThrow(ReturnExceedsSoldError);
		// Lot 1 is item 10's: item 11 has nothing to return to it.
		expect(() =>
			planReturn(sold, [
				{ orderItemId: 11, lotId: 1, quantity: 1, disposition: "restock" },
			]),
		).toThrow(ReturnExceedsSoldError);
	});

	test("merges repeated lines and keeps dispositions apart", () => {
		expect(
			planReturn(sold, [
				{ orderItemId: 10, lotId: 1, quantity: 1, disposition: "restock" },
				{ orderItemId: 10, lotId: 1, quantity: 1, disposition: "write_off" },
			]),
		).toHaveLength(2);
		expect(
			planReturn(sold, [
				{ orderItemId: 10, lotId: 1, quantity: 1, disposition: "restock" },
				{ orderItemId: 10, lotId: 1, quantity: 1, disposition: "restock" },
			]),
		).toEqual([
			{ orderItemId: 10, lotId: 1, quantity: 2, disposition: "restock" },
		]);
	});
});

describe("fullReturn", () => {
	test("returns every unit still out to its lot", () => {
		expect(fullReturn(sold)).toEqual([
			{ orderItemId: 10, lotId: 1, quantity: 2, disposition: "restock" },
			{ orderItemId: 10, lotId: 2, quantity: 1, disposition: "restock" },
			{ orderItemId: 11, lotId: 3, quantity: 2, disposition: "restock" },
		]);
	});

	test("is empty when every unit already came back", () => {
		expect(
			fullReturn([
				{
					orderItemId: 1,
					lotId: 1,
					sold: 1,
					returned: 1,
				},
			]),
		).toEqual([]);
	});
});

describe("returnMovements", () => {
	test("restock puts the units back in the lot", () => {
		expect(
			returnMovements({
				orderItemId: 10,
				lotId: 1,
				quantity: 2,
				disposition: "restock",
			}),
		).toEqual([{ lotId: 1, kind: "return", quantity: 2, reason: null }]);
	});

	test("write-off brings the units back and records them as waste", () => {
		expect(
			returnMovements({
				orderItemId: 10,
				lotId: 1,
				quantity: 2,
				disposition: "write_off",
			}),
		).toEqual([
			{ lotId: 1, kind: "return", quantity: 2, reason: null },
			{ lotId: 1, kind: "waste", quantity: -2, reason: "customer_return" },
		]);
	});
});
