import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { renderWithSettings } from "../merchandising/render-with-settings";
import { CategoryForm } from "./category-dialog";
import type { CategoryDetail } from "./queries";

const category: CategoryDetail = {
	id: 3,
	slug: "serum",
	routineStep: 2,
	status: "active",
	translations: [
		{
			categoryId: 3,
			locale: "es",
			name: "Sérum",
			description: "Productos para tratar la piel.",
			seoTitle: "Sérum facial",
			seoDescription: null,
		},
		{
			categoryId: 3,
			locale: "en",
			name: "Serum",
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
		expect(input(out, "routineStep")).toContain('value=""');
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
		expect(input(out, "slug")).toContain('value="serum"');
		expect(input(out, "routineStep")).toContain('value="2"');
		expect(input(out, "translations.es.name")).toContain('value="Sérum"');
		expect(input(out, "translations.es.seoTitle")).toContain(
			'value="Sérum facial"',
		);
		expect(out).toMatch(/<textarea[^>]*name="translations.es.seoDescription"/);
		expect(out).toMatch(/<textarea[^>]*name="translations.es.description"/);
		expect(out).toContain("Productos para tratar la piel.");
	});

	test("has its labels, a way to cancel and a save button", () => {
		const out = renderWithSettings(<CategoryForm onClose={() => {}} />);
		for (const label of [
			m.admin_field_name(),
			m.admin_merch_seo_title(),
			m.admin_merch_seo_description(),
			m.admin_merch_slug(),
			m.admin_category_step(),
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
