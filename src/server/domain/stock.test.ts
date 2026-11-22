import { describe, expect, test } from "bun:test";
import { lineMax, sellableUnits, unitsAvailability } from "./stock";

describe("sellableUnits", () => {
	test("is the units on hand, never below zero", () => {
		expect(sellableUnits(5)).toBe(5);
		expect(sellableUnits(0)).toBe(0);
		expect(sellableUnits(-1)).toBe(0);
	});
});

describe("lineMax", () => {
	test("is the smaller of the sellable units and the store's limit", () => {
		expect(lineMax(3, 20)).toBe(3);
		expect(lineMax(20, 20)).toBe(20);
		expect(lineMax(21, 20)).toBe(20);
		expect(lineMax(0, 20)).toBe(0);
	});
});

describe("unitsAvailability", () => {
	test("one unit is in stock, none is sold out", () => {
		expect(unitsAvailability(1)).toBe("in_stock");
		expect(unitsAvailability(0)).toBe("sold_out");
	});
});
