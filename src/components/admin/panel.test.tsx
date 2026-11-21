import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Panel } from "./panel";

const classesOf = (html: string) =>
	(/class="([^"]*)"/.exec(html)?.[1] ?? "").split(" ");

test("a panel is flat and leaves the spacing to its children", () => {
	const classes = classesOf(renderToStaticMarkup(<Panel>x</Panel>));
	expect(classes).toContain("border");
	for (const own of ["gap-0", "py-0", "shadow-none"])
		expect(classes).toContain(own);
	for (const generated of ["gap-6", "py-6", "shadow-sm"])
		expect(classes).not.toContain(generated);
});

test("a panel takes the padding it is given in place of the flat default", () => {
	const classes = classesOf(
		renderToStaticMarkup(<Panel className="p-5">x</Panel>),
	);
	expect(classes).toContain("p-5");
	expect(classes).not.toContain("py-0");
});
