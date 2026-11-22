import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { renderAdmin } from "#/test/admin-render";
import { PromotionsTable } from "./promotions-table";
import type { AdminPromotion } from "./queries";
import { promotionsQuery } from "./queries";
import { promotionSearchDefaults } from "./search";

type Page = {
	items: AdminPromotion[];
	total: number;
	page: number;
	pageSize: number;
	pageCount: number;
};
const promotion = (over: Partial<AdminPromotion> = {}): AdminPromotion => ({
	id: 1,
	code: "SPRING10",
	type: "percentage",
	value: 10,
	minSubtotal: null,
	startsOn: "2026-03-01",
	endsOn: "2026-03-31",
	usageLimit: 100,
	perCustomerLimit: null,
	firstOrderOnly: false,
	status: "active",
	createdAt: "2026-01-01T12:00:00Z",
	updatedAt: "2026-01-01T12:00:00Z",
	usage: 3,
	termsLocked: true,
	translations: [
		{ promotionId: 1, locale: "es", description: "10% de primavera" },
		{ promotionId: 1, locale: "en", description: "Spring" },
	],
	...over,
});
const page = (items: AdminPromotion[]): Page => ({
	items,
	total: items.length,
	page: 1,
	pageSize: 25,
	pageCount: 1,
});

const render = (data: Page, search = promotionSearchDefaults) =>
	renderAdmin(<PromotionsTable search={search} onSearchChange={() => {}} />, {
		queries: [[promotionsQuery(search).queryKey, data]],
	});

describe("PromotionsTable", () => {
	test("draws a row per promotion: code, description, discount, dates, uses and status", () => {
		const html = render(
			page([
				promotion(),
				promotion({
					id: 2,
					code: "FIJO5",
					type: "fixed",
					value: 500,
					minSubtotal: 2000,
					startsOn: null,
					endsOn: null,
					usageLimit: null,
					usage: 0,
					status: "inactive",
					translations: [],
				}),
			]),
		);
		expect(html).toContain("SPRING10");
		expect(html).toContain("10% de primavera");
		expect(html).toContain(m.admin_promotion_percent_off({ value: 10 }));
		expect(html).toContain(m.admin_promotion_usage_of({ used: 3, limit: 100 }));
		expect(html).toContain(m.admin_promotion_status_active());
		expect(html).toContain("FIJO5");
		expect(html).toContain(m.admin_promotion_amount_off({ amount: "$5.00" }));
		expect(html).toContain(m.admin_promotion_minimum({ amount: "$20.00" }));
		expect(html).toContain(m.admin_promotion_status_inactive());
		// The second has no dates: one "no date" per date column.
		expect(html.split(m.admin_promotion_no_date()).length - 1).toBe(2);
		expect(html).toContain(m.admin_table_range({ from: 1, to: 2, total: 2 }));
	});

	test("each row has a menu named after its code", () => {
		const html = render(
			page([promotion(), promotion({ id: 2, code: "FIJO5" })]),
		);
		expect(html).toContain(
			`aria-label="${m.admin_promotion_row_actions({ code: "SPRING10" })}"`,
		);
		expect(html).toContain(
			`aria-label="${m.admin_promotion_row_actions({ code: "FIJO5" })}"`,
		);
	});

	test("heads each column and marks the sort in use", () => {
		const html = render(page([promotion()]));
		for (const label of [
			m.admin_promotion_col_code(),
			m.admin_promotion_col_discount(),
			m.admin_promotion_col_starts(),
			m.admin_promotion_col_ends(),
			m.admin_promotion_col_usage(),
			m.admin_col_status(),
			m.admin_promotion_col_created(),
		])
			expect(html).toContain(label);
		const sorted = /<th[^>]*aria-sort="descending"[^>]*>.*?<\/th>/.exec(html);
		expect(sorted?.[0]).toContain(m.admin_promotion_col_created());
	});

	test("has a tab per status, a search on the code and a button to create", () => {
		const html = render(page([promotion()]));
		for (const label of [
			m.admin_promotion_all(),
			m.admin_promotion_status_active(),
			m.admin_promotion_status_inactive(),
			m.admin_promotion_status_archived(),
			m.admin_promotion_new(),
		])
			expect(html).toContain(label);
		expect(html).toContain(`placeholder="${m.admin_promotion_search()}"`);
	});

	test("an empty list offers to create the first code; a search with no match offers to clear", () => {
		const empty = render(page([]));
		expect(empty).toContain(m.admin_promotion_empty());
		expect(empty).toContain(m.admin_promotion_empty_hint());
		expect(empty.split(m.admin_promotion_new()).length - 1).toBe(2);
		const none = render(page([]), { ...promotionSearchDefaults, q: "zzz" });
		expect(none).toContain(m.admin_table_no_results());
		expect(none).not.toContain(m.admin_promotion_empty());
	});
});
