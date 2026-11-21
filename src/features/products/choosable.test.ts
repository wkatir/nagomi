import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { choosable } from "./choosable";

const options = [
	{ value: "1", label: "Alfa", archived: false },
	{ value: "2", label: "Old", archived: true },
	{ value: "3", label: "Beta", archived: false },
];

describe("choosable", () => {
	test("offers the active ones, in their order", () => {
		expect(choosable(options, [])).toEqual([
			{ value: "1", label: "Alfa" },
			{ value: "3", label: "Beta" },
		]);
	});

	test("keeps an archived one the product already has, and says it is archived", () => {
		expect(choosable(options, ["2"])).toEqual([
			{ value: "1", label: "Alfa" },
			{ value: "2", label: m.admin_product_option_archived({ name: "Old" }) },
			{ value: "3", label: "Beta" },
		]);
	});

	test("an active one the product has is just offered", () => {
		expect(choosable(options, ["1"]).map((o) => o.label)).toEqual([
			"Alfa",
			"Beta",
		]);
	});
});
