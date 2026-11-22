import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreButton } from "./store-button";

const classesOf = (html: string) =>
	(/class="([^"]*)"/.exec(html)?.[1] ?? "").split(" ");

describe("StoreButton", () => {
	test("the control height replaces the generated one instead of sitting next to it", () => {
		const md = classesOf(renderToStaticMarkup(<StoreButton>Buy</StoreButton>));
		expect(md).toContain("h-(--control-lg)");
		expect(md).not.toContain("h-9");
		const lg = classesOf(
			renderToStaticMarkup(<StoreButton size="lg">Buy</StoreButton>),
		);
		expect(lg).toContain("h-(--control-xl)");
		expect(lg).not.toContain("h-(--control-lg)");
	});

	test("the label is semibold at the UI size, not the generated medium text-sm", () => {
		const classes = classesOf(
			renderToStaticMarkup(<StoreButton>Buy</StoreButton>),
		);
		expect(classes).toContain("font-semibold");
		expect(classes).not.toContain("font-medium");
		expect(classes).toContain("type-ui");
		expect(classes).not.toContain("text-sm");
	});

	test("solid is the violet pill with dark text, outline a pill border on the background", () => {
		const solid = classesOf(
			renderToStaticMarkup(<StoreButton>Buy</StoreButton>),
		);
		expect(solid).toContain("bg-primary-gradient");
		expect(solid).toContain("text-primary-foreground");
		expect(solid).toContain("rounded-full");
		const outline = classesOf(
			renderToStaticMarkup(<StoreButton variant="outline">Buy</StoreButton>),
		);
		expect(outline).toContain("border-input");
		expect(outline).toContain("bg-transparent");
		expect(outline).not.toContain("bg-background");
	});

	test("link is an always underlined text button", () => {
		const link = classesOf(
			renderToStaticMarkup(<StoreButton variant="link">Back</StoreButton>),
		);
		expect(link).toContain("underline");
		expect(link).toContain("font-normal");
		expect(link).not.toContain("font-bold");
	});

	test("pending disables the button and shows a labelled spinner", () => {
		const html = renderToStaticMarkup(<StoreButton pending>Buy</StoreButton>);
		expect(html).toContain("disabled");
		expect(html).toContain('aria-busy="true"');
		expect(html).toContain('role="status"');
	});

	test("asChild styles the child, so a link looks like the button", () => {
		const html = renderToStaticMarkup(
			<StoreButton asChild fullWidth>
				<a href="/cart">Cart</a>
			</StoreButton>,
		);
		expect(html.startsWith("<a ")).toBe(true);
		expect(html).toContain('href="/cart"');
		expect(html).toContain('data-slot="button"');
		expect(classesOf(html)).toContain("w-full");
	});
});
