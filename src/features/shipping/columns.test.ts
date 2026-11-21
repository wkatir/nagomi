import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { deliveryTime, zoneName } from "./columns";
import type { AdminZone } from "./queries";

describe("deliveryTime", () => {
	test("a range says both ends", () => {
		expect(deliveryTime({ deliveryDaysMin: 1, deliveryDaysMax: 3 })).toBe(
			m.admin_zone_days_range({ min: 1, max: 3 }),
		);
		expect(deliveryTime({ deliveryDaysMin: 0, deliveryDaysMax: 2 })).toBe(
			m.admin_zone_days_range({ min: 0, max: 2 }),
		);
	});

	test("the same day for both ends is a count of days, or the same day for zero", () => {
		expect(deliveryTime({ deliveryDaysMin: 2, deliveryDaysMax: 2 })).toBe(
			m.admin_zone_days_exact({ count: 2 }),
		);
		expect(deliveryTime({ deliveryDaysMin: 1, deliveryDaysMax: 1 })).toBe(
			m.admin_zone_days_exact({ count: 1 }),
		);
		expect(deliveryTime({ deliveryDaysMin: 0, deliveryDaysMax: 0 })).toBe(
			m.admin_zone_same_day(),
		);
	});
});

describe("zoneName", () => {
	const zone = (texts: [string, string][]) =>
		({
			slug: "centro",
			translations: texts.map(([locale, name]) => ({ locale, name })),
		}) as unknown as AdminZone;

	test("is the name in the default language", () => {
		const centro = zone([
			["en", "Downtown"],
			["es", "Centro"],
		]);
		expect(zoneName(centro, "es")).toBe("Centro");
		expect(zoneName(centro, "en")).toBe("Downtown");
	});

	test("is the identifier for a zone with no name in that language", () => {
		expect(zoneName(zone([["en", "Downtown"]]), "es")).toBe("centro");
		expect(zoneName(zone([]), "es")).toBe("centro");
	});
});
