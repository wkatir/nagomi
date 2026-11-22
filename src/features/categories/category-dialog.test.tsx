import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { renderWithSettings } from "../merchandising/render-with-settings";
import { CategoryForm } from "./category-dialog";
import type { CategoryDetail } from "./queries";

const category: CategoryDetail = {
	id: 3,
	slug: "teclados",
	sortOrder: 1,
	icon: "keyboard",
	status: "active",
	translations: [
		{
			categoryId: 3,
			locale: "es",
			name: "Teclados",
			subtitle: "Mecánicos y custom",
			description: "Teclados mecánicos para tu escritorio.",
			seoTitle: "Teclados mecánicos",
			seoDescription: null,
		},
		{
			categoryId: 3,
			locale: "en",
			name: "Keyboards",
			subtitle: null,
			description: null,
			seoTitle: null,
			seoDescription: null,
		},
	],
};

const input = (out: string, name: string) =>
	out.match(new RegExp(`<(?:input|textarea)[^>]*name="${name}"[^>]*>`))?.[0];

describe("CategoryForm", () => {
	test("a new category starts empty, with the principal language first", () => {
		const out = renderWithSettings(<CategoryForm onClose={() => {}} />);
		expect(input(out, "slug")).toContain('value=""');
		expect(input(out, "sortOrder")).toContain('value="0"');
		expect(input(out, "translations.es.name")).toContain('value=""');
		// Only the open language's fields are drawn.
		expect(input(out, "translations.en.name")).toBeUndefined();
		expect(out.indexOf(m.language_name_es())).toBeLessThan(
			out.indexOf(m.language_name_en()),
		);
	});

	test("the other language comes first when it is the store's principal one", () => {
		const out = renderWithSettings(<CategoryForm onClose={() => {}} />, "en");
		expect(input(out, "translations.en.name")).toBeDefined();
		expect(input(out, "translations.es.name")).toBeUndefined();
		expect(out.indexOf(m.language_name_en())).toBeLessThan(
			out.indexOf(m.language_name_es()),
		);
	});

	test("an existing category shows what it has", () => {
		const out = renderWithSettings(
			<CategoryForm category={category} onClose={() => {}} />,
		);
		expect(input(out, "slug")).toContain('value="teclados"');
		expect(input(out, "sortOrder")).toContain('value="1"');
		expect(input(out, "translations.es.name")).toContain('value="Teclados"');
		expect(input(out, "translations.es.subtitle")).toContain(
			'value="Mecánicos y custom"',
		);
		expect(input(out, "translations.es.seoTitle")).toContain(
			'value="Teclados mecánicos"',
		);
		expect(out).toMatch(/<option[^>]*value="keyboard"[^>]*selected/);
		expect(out).toMatch(/<textarea[^>]*name="translations.es.seoDescription"/);
		expect(out).toMatch(/<textarea[^>]*name="translations.es.description"/);
		expect(out).toContain("Teclados mecánicos para tu escritorio.");
	});

	test("has its labels, a way to cancel and a save button", () => {
		const out = renderWithSettings(<CategoryForm onClose={() => {}} />);
		for (const label of [
			m.admin_field_name(),
			m.admin_merch_seo_title(),
			m.admin_merch_seo_description(),
			m.admin_merch_slug(),
			m.admin_category_sort_order(),
			m.admin_category_icon(),
			m.admin_category_subtitle(),
			m.admin_cancel(),
			m.admin_save(),
		])
			expect(out).toContain(label);
		expect(out).toMatch(/<button[^>]*type="submit"/);
	});

	test("shows no error before the first submit", () => {
		const out = renderWithSettings(<CategoryForm onClose={() => {}} />);
		expect(out).not.toContain('role="alert"');
		expect(out).not.toContain(m.admin_required());
	});
});
