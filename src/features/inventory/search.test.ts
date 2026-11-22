import { describe, expect, test } from "bun:test";
import type {
	LotListSearch,
	MovementFilters,
	StockListSearch,
} from "#/lib/schemas/inventory";
import {
	clearedLotFilters,
	clearedMovementFilters,
	clearedStockFilters,
	isLedgerFiltered,
	isLotsFiltered,
	isStockFiltered,
	lotSearchDefaults,
	movementsExportHref,
	reorderSearchDefaults,
	stockSearchDefaults,
} from "./search";

describe("the defaults of the lists", () => {
	test("are what the URL leaves out", () => {
		expect(stockSearchDefaults).toEqual({
			page: 1,
			pageSize: 25,
			sort: "product",
			dir: "asc",
		});
		expect(lotSearchDefaults).toEqual({
			page: 1,
			pageSize: 25,
			sort: "receivedAt",
			dir: "asc",
		});
		expect(reorderSearchDefaults).toEqual({ lookbackWeeks: 8, targetWeeks: 4 });
	});
});

describe("isStockFiltered and isLotsFiltered", () => {
	test("paging and sorting are not filters", () => {
		expect(
			isStockFiltered({
				...stockSearchDefaults,
				page: 3,
				pageSize: 100,
				sort: "onHand",
				dir: "desc",
			}),
		).toBe(false);
		expect(
			isLotsFiltered({ ...lotSearchDefaults, page: 2, sort: "value" }),
		).toBe(false);
	});

	test("the search and the view are", () => {
		expect(isStockFiltered({ ...stockSearchDefaults, q: "teclado" })).toBe(
			true,
		);
		expect(isStockFiltered({ ...stockSearchDefaults, view: "low" })).toBe(true);
		expect(isLotsFiltered({ ...lotSearchDefaults, q: "l2" })).toBe(true);
	});
});

describe("clearing the filters", () => {
	test("takes the search and the view off and goes back to the first page", () => {
		const stock: StockListSearch = {
			...stockSearchDefaults,
			page: 4,
			sort: "sku",
			q: "teclado",
			view: "out",
		};
		expect({ ...stock, ...clearedStockFilters }).toEqual({
			...stockSearchDefaults,
			page: 1,
			sort: "sku",
			q: undefined,
			view: undefined,
		});
		const lots: LotListSearch = {
			...lotSearchDefaults,
			page: 2,
			q: "l1",
		};
		expect({ ...lots, ...clearedLotFilters }).toEqual({
			...lotSearchDefaults,
			page: 1,
			q: undefined,
		});
	});
});

describe("the ledger's filters", () => {
	const none: MovementFilters = {};

	test("none is not filtered, and each one alone is", () => {
		expect(isLedgerFiltered(none)).toBe(false);
		for (const filter of [
			{ kind: "waste" },
			{ reason: "damaged" },
			{ sku: "OIL-50" },
			{ lotId: 3 },
			{ from: "2026-10-01" },
			{ to: "2026-10-31" },
		] as const)
			expect(isLedgerFiltered(filter)).toBe(true);
	});

	test("clearing takes every one off", () => {
		const filtered: MovementFilters = {
			kind: "waste",
			reason: "damaged",
			sku: "OIL-50",
			lotId: 3,
			from: "2026-10-01",
			to: "2026-10-31",
		};
		expect(isLedgerFiltered({ ...filtered, ...clearedMovementFilters })).toBe(
			false,
		);
	});
});

describe("movementsExportHref", () => {
	test("is the CSV of the whole ledger when nothing is filtered", () => {
		expect(movementsExportHref({})).toBe("/api/admin/exports/movements.csv");
	});

	test("carries the filters, and only the ones set", () => {
		expect(
			movementsExportHref({
				kind: "waste",
				sku: "OIL-50",
				from: "2026-10-01",
				to: undefined,
			}),
		).toBe(
			"/api/admin/exports/movements.csv?kind=waste&sku=OIL-50&from=2026-10-01",
		);
	});

	test("encodes a SKU that has characters a URL does not", () => {
		expect(movementsExportHref({ sku: "A&B 50" })).toBe(
			"/api/admin/exports/movements.csv?sku=A%26B+50",
		);
	});
});
