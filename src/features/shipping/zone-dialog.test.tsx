import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { renderAdmin } from "#/test/admin-render";
import type { AdminZone } from "./queries";
import { ZoneForm } from "./zone-dialog";

const zone = (over: Partial<AdminZone> = {}): AdminZone => ({
	id: 1,
	slug: "centro",
	method: "own_delivery",
	fee: 350,
	coversRest: false,
	municipalities: ["San Salvador Centro"],
	deliveryDaysMin: 1,
	deliveryDaysMax: 3,
	position: 4,
	status: "active",
	translations: [
		{
			zoneId: 1,
			locale: "es",
			name: "Centro",
			description: "Entrega en el día",
		},
		{ zoneId: 1, locale: "en", name: "Downtown", description: null },
	],
	...over,
});

const render = (z?: AdminZone, defaultLocale: "es" | "en" = "es") =>
	renderAdmin(<ZoneForm zone={z} onClose={() => {}} />, { defaultLocale });
const hasField = (html: string, name: string) =>
	html.includes(`name="${name}"`);
const FIELDS = [
	"method",
	"fee",
	"coversRest",
	"deliveryDaysMin",
	"deliveryDaysMax",
	"position",
	"translations.es.name",
	"translations.es.description",
];

describe("ZoneForm", () => {
	test("a new zone asks for an identifier and every field of a zone", () => {
		const html = render();
		expect(hasField(html, "slug")).toBe(true);
		for (const name of FIELDS) expect(hasField(html, name)).toBe(true);
		expect(hasField(html, "translations.en.name")).toBe(false);
	});

	test("starts at one to two days, at the top of the list", () => {
		const html = render();
		expect(html).toContain('value="1"');
		expect(html).toContain('value="2"');
		expect(html).toContain('value="0"');
	});

	test("an existing zone shows what it has and keeps its identifier out of the form", () => {
		const html = render(zone());
		expect(hasField(html, "slug")).toBe(false);
		for (const name of FIELDS) expect(hasField(html, name)).toBe(true);
		expect(html).toContain('value="3.50"');
		expect(html).toContain('value="3"');
		expect(html).toContain('value="4"');
		expect(html).toContain('value="Centro"');
		expect(html).toContain('value="Entrega en el día"');
	});

	test("shows the tab of the store's default language first", () => {
		const html = render(zone(), "en");
		expect(hasField(html, "translations.en.name")).toBe(true);
		expect(hasField(html, "translations.es.name")).toBe(false);
		expect(html).toContain('value="Downtown"');
	});

	test("a zone that covers the rest of the country lists no municipalities to choose", () => {
		const html = render(zone({ coversRest: true, municipalities: [] }));
		expect(html).toContain(m.admin_zone_covers_rest_help());
		expect(html).not.toContain("San Salvador Centro");
	});

	test("a zone lists the municipalities by department, its own checked", () => {
		const html = render(zone());
		expect(html).toContain("La Libertad Sur");
		expect(html).toMatch(/aria-checked="true"/);
	});
});
