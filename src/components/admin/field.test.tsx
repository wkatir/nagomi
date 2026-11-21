import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Input } from "#/components/ui/input";
import { Field } from "./field";

const render = (error?: string) =>
	renderToStaticMarkup(
		<Field id="name" label="Name" error={error}>
			<Input id="name" />
		</Field>,
	);

test("an error is announced and linked to the control", () => {
	const html = render("Required");
	expect(html).toContain('role="alert"');
	expect(html).toContain('id="name-error"');
	expect(html).toContain('aria-describedby="name-error"');
	expect(html).toContain('aria-invalid="true"');
	expect(html).toContain("Required");
});

test("a horizontal field puts the control before its label", () => {
	const html = renderToStaticMarkup(
		<Field id="paid" label="Paid" orientation="horizontal">
			<Input id="paid" />
		</Field>,
	);
	expect(html.indexOf("<input")).toBeLessThan(html.indexOf("<label"));
	expect(html).toContain('data-orientation="horizontal"');
	const vertical = render();
	expect(vertical.indexOf("<label")).toBeLessThan(vertical.indexOf("<input"));
});

test("without an error the control is left alone", () => {
	const html = render();
	expect(html).toContain('for="name"');
	expect(html).not.toContain("aria-describedby=");
	expect(html).not.toContain('aria-invalid="');
	expect(html).not.toContain('role="alert"');
});
