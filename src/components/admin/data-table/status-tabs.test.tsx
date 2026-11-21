import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusTabs } from "./status-tabs";

const label = { open: () => "Open", closed: () => "Closed" };
const html = (value?: "open" | "closed") =>
	renderToStaticMarkup(
		<StatusTabs
			values={["open", "closed"]}
			label={label}
			allLabel="Everything"
			value={value}
			onChange={() => {}}
		/>,
	);
const active = (out: string) =>
	[
		...out.matchAll(/<button[^>]*data-state="active"[^>]*>(.*?)<\/button>/g),
	].map((match) => match[1]);

test("all comes first and is the one chosen while no state is", () => {
	const out = html();
	expect(out.indexOf("Everything")).toBeLessThan(out.indexOf("Open"));
	expect(out.indexOf("Open")).toBeLessThan(out.indexOf("Closed"));
	expect(active(out)).toEqual(["Everything"]);
});

test("the state of the filter is the tab chosen", () => {
	expect(active(html("closed"))).toEqual(["Closed"]);
	expect(active(html("open"))).toEqual(["Open"]);
});

test("the row scrolls sideways when it does not fit", () => {
	expect(html()).toContain("overflow-x-auto");
});
