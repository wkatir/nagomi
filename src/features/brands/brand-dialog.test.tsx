import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { renderWithSettings } from "../merchandising/render-with-settings";
import { BrandForm } from "./brand-dialog";
import type { BrandDetail } from "./queries";

const brand: BrandDetail = {
	id: 9,
	slug: "pulsar",
	name: "Pulsar",
	countryCode: "KR",
	status: "active",
	translations: [
		{
			brandId: 9,
			locale: "es",
			description: "Ratones ligeros",
			seoTitle: null,
			seoDescription: null,
		},
	],
};

const input = (out: string, name: string) =>
	out.match(new RegExp(`<(?:input|textarea)[^>]*name="${name}"[^>]*>`))?.[0];

describe("BrandForm", () => {
	test("a new brand starts empty", () => {
		const out = renderWithSettings(<BrandForm onClose={() => {}} />);
		expect(input(out, "name")).toContain('value=""');
		expect(input(out, "slug")).toContain('value=""');
		expect(input(out, "countryCode")).toContain('value=""');
		expect(input(out, "translations.es.description")).toBeDefined();
		expect(input(out, "translations.en.description")).toBeUndefined();
	});

	test("an existing brand shows what it has", () => {
		const out = renderWithSettings(
			<BrandForm brand={brand} onClose={() => {}} />,
		);
		expect(input(out, "name")).toContain('value="Pulsar"');
		expect(input(out, "slug")).toContain('value="pulsar"');
		expect(input(out, "countryCode")).toContain('value="KR"');
		expect(out).toContain("Ratones ligeros");
	});

	test("a brand without a country shows the field empty", () => {
		const out = renderWithSettings(
			<BrandForm brand={{ ...brand, countryCode: null }} onClose={() => {}} />,
		);
		expect(input(out, "countryCode")).toContain('value=""');
	});

	test("has its labels, a way to cancel and a save button", () => {
		const out = renderWithSettings(<BrandForm onClose={() => {}} />);
		for (const label of [
			m.admin_field_name(),
			m.admin_merch_slug(),
			m.admin_brand_country(),
			m.admin_field_description(),
			m.admin_merch_seo_title(),
			m.admin_cancel(),
			m.admin_save(),
		])
			expect(out).toContain(label);
		expect(out).toMatch(/<button[^>]*type="submit"/);
		expect(out).not.toContain('role="alert"');
	});
});
