import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { renderWithSettings } from "../merchandising/render-with-settings";
import { ConcernForm } from "./concern-dialog";
import type { ConcernDetail } from "./queries";

const concern: ConcernDetail = {
	id: 5,
	slug: "dark-spots",
	position: 12,
	status: "active",
	translations: [
		{
			concernId: 5,
			locale: "es",
			name: "Manchas",
			description: "Para el tono desigual.",
			seoTitle: null,
			seoDescription: null,
		},
	],
};

const input = (out: string, name: string) =>
	out.match(new RegExp(`<(?:input|textarea)[^>]*name="${name}"[^>]*>`))?.[0];

describe("ConcernForm", () => {
	test("a new need starts empty, at the front of the list", () => {
		const out = renderWithSettings(<ConcernForm onClose={() => {}} />);
		expect(input(out, "slug")).toContain('value=""');
		expect(input(out, "position")).toContain('value="0"');
		expect(input(out, "translations.es.name")).toContain('value=""');
		expect(input(out, "translations.en.name")).toBeUndefined();
	});

	test("an existing need shows what it has", () => {
		const out = renderWithSettings(
			<ConcernForm concern={concern} onClose={() => {}} />,
		);
		expect(input(out, "slug")).toContain('value="dark-spots"');
		expect(input(out, "position")).toContain('value="12"');
		expect(input(out, "translations.es.name")).toContain('value="Manchas"');
		expect(input(out, "translations.es.description")).toBeDefined();
		expect(out).toContain("Para el tono desigual.");
	});

	test("draws the intro and the search engine texts of the open language", () => {
		const out = renderWithSettings(<ConcernForm onClose={() => {}} />);
		expect(input(out, "translations.es.description")).toBeDefined();
		expect(input(out, "translations.es.seoTitle")).toBeDefined();
		expect(input(out, "translations.es.seoDescription")).toBeDefined();
		expect(input(out, "translations.en.description")).toBeUndefined();
	});

	test("has its labels, a way to cancel and a save button", () => {
		const out = renderWithSettings(<ConcernForm onClose={() => {}} />);
		for (const label of [
			m.admin_field_name(),
			m.admin_merch_slug(),
			m.admin_concern_position(),
			m.admin_cancel(),
			m.admin_save(),
		])
			expect(out).toContain(label);
		expect(out).toMatch(/<button[^>]*type="submit"/);
		expect(out).not.toContain('role="alert"');
	});
});
