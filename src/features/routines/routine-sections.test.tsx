import { describe, expect, test } from "bun:test";
import type { QueryClient } from "@tanstack/react-query";
import { m } from "#/paraglide/messages";
import { concernOptionsQuery } from "../concerns/queries";
import { renderWithSettings } from "../merchandising/render-with-settings";
import type { RoutineDetail } from "./queries";
import { RoutineDetails } from "./routine-details";
import { RoutineSteps } from "./routine-steps";
import { RoutineTexts } from "./routine-texts";

// How a disabled control is written in the markup (the word also appears in its classes).
const DISABLED = ' disabled=""';

const routine: RoutineDetail = {
	id: 7,
	slug: "morning",
	status: "draft",
	isFeatured: true,
	position: 3,
	concernId: null,
	translations: [
		{
			routineId: 7,
			locale: "es",
			title: "Rutina de mañana",
			description: "Para empezar el día",
			seoTitle: null,
			seoDescription: null,
		},
	],
	items: [
		{
			routineId: 7,
			variantId: 11,
			position: 1,
			sku: "CLN-150",
			variantStatus: "active",
			name: "Limpiador suave",
		},
		{
			routineId: 7,
			variantId: 12,
			position: 2,
			sku: "SRM-30",
			variantStatus: "archived",
			name: "Sérum calmante",
		},
	],
};

const input = (out: string, name: string) =>
	out.match(new RegExp(`<(?:input|textarea)[^>]*name="${name}"[^>]*>`))?.[0];

describe("RoutineSteps", () => {
	const out = renderWithSettings(<RoutineSteps routine={routine} />);

	test("lists the steps in order, each with its position, name and SKU", () => {
		expect(out.indexOf("Limpiador suave")).toBeGreaterThan(-1);
		expect(out.indexOf("Limpiador suave")).toBeLessThan(
			out.indexOf("Sérum calmante"),
		);
		expect(out).toContain("CLN-150");
		expect(out).toContain("SRM-30");
		expect(out).toMatch(/<li[^>]*>.*?>1<.*?Limpiador suave/);
		expect(out).toMatch(/<li[^>]*>.*?>2<.*?Sérum calmante/);
	});

	test("the buttons of a step say whose they are, and the ends cannot move past themselves", () => {
		const up = (name: string) =>
			out.match(
				new RegExp(
					`<button[^>]*aria-label="${m.admin_merch_move_up({ name })}"[^>]*>`,
				),
			)?.[0];
		const down = (name: string) =>
			out.match(
				new RegExp(
					`<button[^>]*aria-label="${m.admin_merch_move_down({ name })}"[^>]*>`,
				),
			)?.[0];
		expect(up("Limpiador suave")).toContain(DISABLED);
		expect(down("Limpiador suave")).not.toContain(DISABLED);
		expect(up("Sérum calmante")).not.toContain(DISABLED);
		expect(down("Sérum calmante")).toContain(DISABLED);
		expect(out).toContain(
			`aria-label="${m.admin_merch_remove({ name: "Sérum calmante" })}"`,
		);
	});

	test("says which size was archived since it was added", () => {
		expect(
			out.match(new RegExp(m.admin_routine_size_archived(), "g")),
		).toHaveLength(1);
	});

	test("offers to search for a product, and to save only once something changed", () => {
		expect(out).toContain(m.admin_merch_find_product());
		expect(out).toMatch(
			new RegExp(
				`<button[^>]* disabled=""[^>]*>[^<]*${m.admin_routine_save_steps()}`,
			),
		);
	});

	test("with no steps it says so", () => {
		const empty = renderWithSettings(
			<RoutineSteps routine={{ ...routine, items: [] }} />,
		);
		expect(empty).toContain(m.admin_routine_steps_empty());
		expect(empty).not.toContain("<ol");
	});
});

const needs = [
	{ id: 1, name: "Acné", status: "active" as const },
	{ id: 2, name: "Resequedad", status: "archived" as const },
	{ id: 3, name: "Poros", status: "active" as const },
];
const withNeeds = (client: QueryClient) =>
	client.setQueryData(concernOptionsQuery.queryKey, needs);
const optionsOf = (out: string) =>
	[...out.matchAll(/<option[^>]*value="([^"]*)"/g)].map((match) => match[1]);

describe("RoutineDetails", () => {
	test("offers no need, then the active ones, and marks the routine's own", () => {
		const out = renderWithSettings(
			<RoutineDetails routine={{ ...routine, concernId: 3 }} />,
			"es",
			withNeeds,
		);
		expect(out).toContain(m.admin_routine_concern());
		expect(optionsOf(out)).toEqual(["", "1", "3"]);
		expect(out).toMatch(/<option[^>]*value="3"[^>]*selected/);
	});

	test("keeps an archived need in the list while the routine still answers it", () => {
		const out = renderWithSettings(
			<RoutineDetails routine={{ ...routine, concernId: 2 }} />,
			"es",
			withNeeds,
		);
		expect(optionsOf(out)).toEqual(["", "1", "2", "3"]);
	});

	test("shows the address, the place and whether it is featured", () => {
		const out = renderWithSettings(<RoutineDetails routine={routine} />);
		expect(input(out, "slug")).toContain('value="morning"');
		expect(input(out, "slug")).not.toContain(DISABLED);
		expect(input(out, "position")).toContain('value="3"');
		expect(out).toMatch(/<button[^>]*role="checkbox"[^>]*aria-checked="true"/);
		expect(out).not.toContain(m.admin_routine_slug_locked());
	});

	test("a published routine keeps its address, and says why", () => {
		const out = renderWithSettings(
			<RoutineDetails routine={{ ...routine, status: "published" }} />,
		);
		expect(input(out, "slug")).toContain(DISABLED);
		expect(out).toContain(m.admin_routine_slug_locked());
	});
});

describe("RoutineTexts", () => {
	test("shows the texts of the principal language first", () => {
		const out = renderWithSettings(
			<RoutineTexts
				routine={routine}
				defaultLocale="es"
				onSaved={async () => {}}
			/>,
		);
		expect(input(out, "translations.es.title")).toContain(
			'value="Rutina de mañana"',
		);
		expect(out).toContain("Para empezar el día");
		expect(input(out, "translations.en.title")).toBeUndefined();
		expect(out.indexOf(m.language_name_es())).toBeLessThan(
			out.indexOf(m.language_name_en()),
		);
	});

	test("starts with save disabled, since nothing changed", () => {
		const out = renderWithSettings(
			<RoutineTexts
				routine={routine}
				defaultLocale="es"
				onSaved={async () => {}}
			/>,
		);
		expect(out).toMatch(
			new RegExp(`<button[^>]* disabled=""[^>]*>[^<]*${m.admin_save()}`),
		);
	});
});
