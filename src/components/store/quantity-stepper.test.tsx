import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QuantityStepper } from "./quantity-stepper";

const render = (props: Partial<Parameters<typeof QuantityStepper>[0]> = {}) =>
	renderToStaticMarkup(
		<QuantityStepper
			value={2}
			max={5}
			onChange={() => {}}
			label="Quantity"
			{...props}
		/>,
	);

const classes = (tag: string | undefined) =>
	(/class="([^"]*)"/.exec(tag ?? "")?.[1] ?? "").split(" ");
const group = (html: string) =>
	classes(/<div[^>]*role="group"[^>]*>/.exec(html)?.[0]);
// The box around the number: the element that holds the <output>.
const cell = (html: string) => classes(/<div[^>]*>(?=<output)/.exec(html)?.[0]);
const buttons = (html: string) => html.match(/<button[^>]*>/g) ?? [];
// The attribute, not the `disabled:` variants that every generated button carries.
const isDisabled = (tag: string | undefined) => / disabled=""/.test(tag ?? "");

describe("QuantityStepper", () => {
	test("is a named group of two buttons around the value", () => {
		const html = render();
		expect(html).toContain('role="group"');
		expect(html).toContain('aria-label="Quantity"');
		expect(buttons(html)).toHaveLength(2);
		expect(html).toContain("<output");
		expect(html).toContain(">2</output>");
	});

	test("the value cell reads at body size on the page background, not the muted 14px cell of the generated component", () => {
		const c = cell(render());
		expect(c).toContain("type-body");
		expect(c).not.toContain("text-sm");
		expect(c).toContain("bg-background");
		expect(c).not.toContain("bg-muted");
	});

	test("buttons and value share the control height of the size", () => {
		const md = render();
		expect(cell(md)).toContain("h-(--control-lg)");
		for (const b of buttons(md)) {
			expect(classes(b)).toContain("h-(--control-lg)");
			expect(classes(b)).not.toContain("h-9");
		}
		const lg = render({ size: "lg" });
		expect(cell(lg)).toContain("h-(--control-xl)");
		for (const b of buttons(lg)) {
			expect(classes(b)).toContain("h-(--control-xl)");
			expect(classes(b)).not.toContain("h-(--control-lg)");
		}
	});

	test("the group takes the class it is given, so a page can hide it on phones", () => {
		expect(group(render({ className: "max-md:hidden" }))).toContain(
			"max-md:hidden",
		);
	});

	test("the minus button is disabled at 1, the plus button at the maximum, neither in between", () => {
		const [minusMin, plusMin] = buttons(render({ value: 1 }));
		expect(isDisabled(minusMin)).toBe(true);
		expect(isDisabled(plusMin)).toBe(false);
		const [minusMid, plusMid] = buttons(render({ value: 3 }));
		expect(isDisabled(minusMid)).toBe(false);
		expect(isDisabled(plusMid)).toBe(false);
		const [minusMax, plusMax] = buttons(render({ value: 5 }));
		expect(isDisabled(minusMax)).toBe(false);
		expect(isDisabled(plusMax)).toBe(true);
	});
});
