import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckboxGroup, toggled } from "./checkbox-group";

describe("toggled", () => {
	const all = ["a", "b", "c", "d"] as const;

	test("checks a value in its place in the list, not at the end", () => {
		expect(toggled(all, ["a", "d"], "b", true)).toEqual(["a", "b", "d"]);
		expect(toggled(all, [], "c", true)).toEqual(["c"]);
	});

	test("unchecks only that value", () => {
		expect(toggled(all, ["a", "b", "d"], "b", false)).toEqual(["a", "d"]);
		expect(toggled(all, ["a"], "a", false)).toEqual([]);
	});

	test("checking what is checked, or unchecking what is not, changes nothing", () => {
		expect(toggled(all, ["a", "b"], "b", true)).toEqual(["a", "b"]);
		expect(toggled(all, ["a"], "d", false)).toEqual(["a"]);
	});

	test("drops a chosen value that is not in the list", () => {
		expect(toggled(["a", "b"], ["z", "a"], "b", true)).toEqual(["a", "b"]);
	});
});

describe("CheckboxGroup", () => {
	const html = renderToStaticMarkup(
		<CheckboxGroup
			legend="Connectivity"
			options={[
				{ value: "bluetooth", label: "Bluetooth" },
				{ value: "wired", label: "Wired" },
			]}
			value={["wired"]}
			onChange={() => {}}
		/>,
	);

	test("names the group and each option", () => {
		expect(html).toContain("<legend");
		expect(html).toContain("Connectivity");
		expect(html.indexOf("Bluetooth")).toBeLessThan(html.indexOf("Wired"));
	});

	test("shows as checked the ones chosen, and only those", () => {
		expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
		expect(html.match(/aria-checked="false"/g)).toHaveLength(1);
	});
});
