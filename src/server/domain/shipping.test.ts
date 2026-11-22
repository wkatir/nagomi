import { describe, expect, test } from "bun:test";
import { zoneFee, zoneForMunicipality } from "./shipping";

const metro = {
	method: "own_delivery" as const,
	fee: 350,
	deliveryDaysMin: 1,
	deliveryDaysMax: 2,
};

describe("zoneFee", () => {
	test("waives the fee from the store's free shipping amount", () => {
		expect(zoneFee(metro, 4999, 5000)).toBe(350);
		expect(zoneFee(metro, 5000, 5000)).toBe(0);
	});

	test("always charges when the store has no free shipping amount", () => {
		expect(zoneFee(metro, 1_000_000, null)).toBe(350);
	});

	test("refuses a total that is not a whole non-negative amount", () => {
		expect(() => zoneFee(metro, -1, 5000)).toThrow("Invalid merchandise total");
	});
});

describe("zoneForMunicipality", () => {
	const zones = [
		{
			zone: "metro",
			coversRest: false,
			municipalities: ["San Salvador Centro", "La Libertad Sur"],
		},
		{ zone: "rest", coversRest: true, municipalities: [] },
	];

	test("a listed municipality is served by its zone", () => {
		expect(zoneForMunicipality(zones, "La Libertad Sur")).toBe("metro");
	});

	test("any other municipality is served by the zone that covers the rest", () => {
		expect(zoneForMunicipality(zones, "San Miguel Centro")).toBe("rest");
	});

	test("without a zone for the rest, an unlisted municipality has none", () => {
		expect(zoneForMunicipality([zones[0]], "San Miguel Centro")).toBeNull();
	});
});
