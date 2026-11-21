import { describe, expect, test } from "bun:test";
import type { OrderListSearch } from "#/lib/schemas/orders";
import {
	clearedFilters,
	exportHref,
	isFiltered,
	orderSearchDefaults,
} from "./search";

const base: OrderListSearch = { ...orderSearchDefaults };

describe("orderSearchDefaults", () => {
	test("is what the URL leaves out", () => {
		expect(orderSearchDefaults).toEqual({
			page: 1,
			pageSize: 25,
			sort: "createdAt",
			dir: "desc",
		});
	});
});

describe("isFiltered", () => {
	test("paging and sorting are not filters", () => {
		expect(isFiltered(base)).toBe(false);
		expect(
			isFiltered({ ...base, page: 4, pageSize: 100, sort: "code", dir: "asc" }),
		).toBe(false);
	});

	test("each filter alone is", () => {
		for (const filter of [
			{ q: "ana" },
			{ status: "pending" },
			{ paymentStatus: "unpaid" },
			{ channel: "whatsapp" },
			{ from: "2026-10-01" },
			{ to: "2026-10-31" },
		] as const)
			expect(isFiltered({ ...base, ...filter })).toBe(true);
	});
});

describe("clearedFilters", () => {
	test("takes every filter off and goes back to the first page", () => {
		const filtered: OrderListSearch = {
			...base,
			page: 5,
			sort: "total",
			dir: "asc",
			q: "ana",
			status: "pending",
			paymentStatus: "unpaid",
			channel: "whatsapp",
			from: "2026-10-01",
			to: "2026-10-31",
		};
		const cleared = { ...filtered, ...clearedFilters };
		expect(isFiltered(cleared)).toBe(false);
		expect(cleared.page).toBe(1);
		// The sort the user chose stays.
		expect(cleared).toMatchObject({ sort: "total", dir: "asc" });
	});
});

describe("exportHref", () => {
	test("exports every order when nothing filters", () => {
		expect(exportHref(base)).toBe("/api/admin/exports/orders.csv");
	});

	test("carries the filters, and neither the page nor the sort", () => {
		const href = exportHref({
			...base,
			page: 3,
			pageSize: 50,
			sort: "total",
			dir: "asc",
			q: "Ana Pérez",
			status: "delivered",
			from: "2026-10-01",
			to: "2026-10-31",
		});
		const [path, query] = href.split("?");
		expect(path).toBe("/api/admin/exports/orders.csv");
		const params = new URLSearchParams(query);
		expect(Object.fromEntries(params)).toEqual({
			q: "Ana Pérez",
			status: "delivered",
			from: "2026-10-01",
			to: "2026-10-31",
		});
	});
});
