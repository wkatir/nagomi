import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "#/components/ui/button";
import { FormCard } from "./form-card";

const render = (description?: string) =>
	renderToStaticMarkup(
		<FormCard
			title="Identity"
			description={description}
			onSubmit={() => {}}
			footer={<Button type="submit">Save</Button>}
		>
			<p>Fields</p>
		</FormCard>,
	);

describe("FormCard", () => {
	test("is one form: the fields and the buttons are inside it, the title is not", () => {
		const html = render();
		const form = html.slice(html.indexOf("<form"), html.indexOf("</form>"));
		expect(form).toContain("Fields");
		expect(form).toContain("Save");
		expect(form).not.toContain("Identity");
		expect(html).toContain("<h2");
		expect(html).toContain("Identity");
	});

	test("does not let the browser validate: the page does", () => {
		expect(render()).toContain("noValidate");
	});

	test("says what the card is for only when it is told", () => {
		expect(render()).not.toContain("text-muted-foreground");
		expect(render("What it is for")).toContain("What it is for");
	});
});
