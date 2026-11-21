import { describe, expect, test } from "bun:test";
import { auditFilterShape, auditListSearch } from "#/lib/schemas/audit";
import { clearedFilters, isFiltered } from "./search";

describe("isFiltered", () => {
	test("is off with nothing chosen", () => {
		expect(isFiltered(auditListSearch.parse({}))).toBe(false);
	});

	test("is on for each filter alone", () => {
		for (const search of [
			{ entityType: "order" },
			{ actor: "ana" },
			{ verb: "status" },
			{ from: "2026-10-01", to: "2026-10-02" },
		])
			expect(isFiltered(auditListSearch.parse(search))).toBe(true);
	});
});

describe("clearedFilters", () => {
	test("clears every filter of the log and nothing else", () => {
		expect(Object.keys(clearedFilters).sort()).toEqual(
			Object.keys(auditFilterShape).sort(),
		);
		expect(Object.values(clearedFilters).every((v) => v === undefined)).toBe(
			true,
		);
	});

	test("leaves a search that is filtered with none", () => {
		const cleared = {
			...auditListSearch.parse({ entityType: "order", verb: "create" }),
			...clearedFilters,
		};
		expect(isFiltered(cleared)).toBe(false);
	});
});
