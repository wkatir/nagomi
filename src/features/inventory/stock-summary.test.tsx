import { describe, expect, test } from "bun:test";
import { renderWithStore } from "#/lib/test-store";
import { m } from "#/paraglide/messages";
import { type StockSummary as Summary, stockSummaryQuery } from "./queries";
import { StockSummary } from "./stock-summary";

const summary: Summary = {
	units: 120,
	value: 84_050,
	lowStock: 3,
};

const html = (data?: Summary) =>
	renderWithStore(<StockSummary />, (queryClient) => {
		if (data) queryClient.setQueryData(stockSummaryQuery.queryKey, data);
	});

describe("StockSummary", () => {
	test("gives the units in stock with their cost and what is low", () => {
		const out = html(summary);
		expect(out).toContain(m.admin_units({ count: 120 }));
		expect(out).toContain(
			m.admin_inventory_sum_stock_note({ amount: "$840.50" }),
		);
		expect(out).toContain(m.admin_inventory_sum_low());
		expect(out).toContain(">3<");
	});

	test("marks what needs attention, and only that", () => {
		expect(html(summary)).toContain('data-tone="warning"');
		const calm = html({ ...summary, lowStock: 0 });
		expect(calm).not.toContain('data-tone="warning"');
	});

	test("shows its place while the figures load", () => {
		const out = html();
		expect(out).toContain("aria-busy");
		expect(out).not.toContain(m.admin_inventory_sum_stock());
	});
});
