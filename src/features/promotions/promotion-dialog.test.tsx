import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { renderAdmin } from "#/test/admin-render";
import { PromotionForm } from "./promotion-dialog";
import type { AdminPromotion } from "./queries";

const promotion = (over: Partial<AdminPromotion> = {}): AdminPromotion => ({
	id: 1,
	code: "SPRING10",
	type: "percentage",
	value: 10,
	minSubtotal: null,
	startsOn: "2026-03-01",
	endsOn: null,
	usageLimit: 100,
	perCustomerLimit: null,
	firstOrderOnly: false,
	status: "active",
	createdAt: "2026-01-01T12:00:00Z",
	updatedAt: "2026-01-01T12:00:00Z",
	usage: 0,
	termsLocked: false,
	translations: [
		{ promotionId: 1, locale: "es", description: "10% de primavera" },
		{ promotionId: 1, locale: "en", description: "Spring" },
	],
	...over,
});

const render = (p?: AdminPromotion) =>
	renderAdmin(<PromotionForm promotion={p} onClose={() => {}} />);
const TERMS = [
	"code",
	"type",
	"value",
	"minSubtotal",
	"oncePerCustomer",
	"firstOrderOnly",
];
const SETTINGS = [
	"startsOn",
	"endsOn",
	"usageLimit",
	"status",
	"translations.es.description",
];
const hasField = (html: string, name: string) =>
	html.includes(`name="${name}"`);

describe("PromotionForm", () => {
	test("a new promotion asks for its terms, its settings and the description of the default language", () => {
		const html = render();
		for (const name of [...TERMS, ...SETTINGS])
			expect(hasField(html, name)).toBe(true);
		expect(html).not.toContain(m.admin_promotion_locked());
		expect(hasField(html, "translations.en.description")).toBe(false);
		expect(html).toContain(m.language_name_en());
	});

	test("starts inactive and cannot start archived", () => {
		const html = render();
		expect(html).toContain(m.admin_promotion_status_inactive());
		expect(html).toContain(m.admin_promotion_status_active());
		expect(html).not.toContain(m.admin_promotion_status_archived());
	});

	test("an existing promotion shows what it has and can be archived", () => {
		const html = render(promotion());
		expect(html).toContain('value="SPRING10"');
		expect(html).toContain('value="10"');
		expect(html).toContain('value="2026-03-01"');
		expect(html).toContain('value="100"');
		expect(html).toContain('value="10% de primavera"');
		expect(html).toContain(m.admin_promotion_status_archived());
		expect(html).not.toContain(m.admin_promotion_locked());
	});

	test("a fixed amount is shown as an amount of the store currency", () => {
		const html = render(
			promotion({ type: "fixed", value: 525, minSubtotal: 2000 }),
		);
		expect(html).toContain('value="5.25"');
		expect(html).toContain('value="20.00"');
		expect(html).toContain(m.admin_promotion_value_fixed());
		expect(html).not.toContain(m.admin_promotion_value_percentage());
	});

	test("once an order used the code its terms are shown, explained, and cannot be edited", () => {
		const html = render(promotion({ termsLocked: true, usage: 3 }));
		expect(html).toContain(m.admin_promotion_locked());
		for (const name of TERMS) expect(hasField(html, name)).toBe(false);
		expect(html).toContain("SPRING10");
		expect(html).toContain(m.admin_promotion_type_percentage());
		expect(html).toContain("10%");
		expect(html).toContain(m.admin_promotion_none());
		for (const name of SETTINGS) expect(hasField(html, name)).toBe(true);
	});

	test("a locked fixed amount and minimum are shown in the store currency", () => {
		const html = render(
			promotion({
				termsLocked: true,
				type: "fixed",
				value: 525,
				minSubtotal: 2000,
			}),
		);
		expect(html).toContain(m.admin_promotion_type_fixed());
		expect(html).toContain(m.admin_promotion_value_fixed());
		expect(html).toContain("$5.25");
		expect(html).toContain("$20.00");
		expect(html).not.toContain(m.admin_promotion_none());
	});
});
