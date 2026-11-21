import { describe, expect, test } from "bun:test";
import { renderWithStore } from "#/lib/test-store";
import { m } from "#/paraglide/messages";
import { type StockSummary as Summary, stockSummaryQuery } from "./queries";
import { StockSummary } from "./stock-summary";

const summary: Summary = {
	units: 120,
	value: 84_050,
	expiringUnits: 14,
	expiringValue: 9_800,
	expiredUnits: 6,
	expiredValue: 7_200,
	belowReorderPoint: 3,
};

const html = (data?: Summary) =>
	renderWithStore(<StockSummary />, (queryClient) => {
		if (data) queryClient.setQueryData(stockSummaryQuery.queryKey, data);
	});

describe("StockSummary", () => {
	test("gives the units in stock with their cost, what expires, what expired and what is low", () => {
		const out = html(summary);
		expect(out).toContain(m.admin_units({ count: 120 }));
		expect(out).toContain(
			m.admin_inventory_sum_stock_note({ amount: "$840.50" }),
		);
		expect(out).toContain(m.admin_units({ count: 14 }));
		expect(out).toContain(
			m.admin_inventory_sum_stock_note({ amount: "$98.00" }),
		);
		expect(out).toContain(m.admin_units({ count: 6 }));
		expect(out).toContain(
			m.admin_inventory_sum_expired_note({ amount: "$72.00" }),
		);
		expect(out).toContain(m.admin_inventory_sum_low());
		expect(out).toContain(">3<");
	});

	test("marks what needs attention, and only that", () => {
		expect(html(summary)).toContain('data-tone="warning"');
		expect(html(summary)).toContain('data-tone="destructive"');
		const calm = html({
			...summary,
			expiringUnits: 0,
			expiredUnits: 0,
			belowReorderPoint: 0,
		});
		expect(calm).not.toContain('data-tone="warning"');
		expect(calm).not.toContain('data-tone="destructive"');
	});

	test("shows its place while the figures load", () => {
		const out = html();
		expect(out).toContain("aria-busy");
		expect(out).not.toContain(m.admin_inventory_sum_stock());
	});
});
