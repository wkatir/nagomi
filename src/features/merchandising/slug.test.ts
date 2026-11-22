import { expect, test } from "bun:test";
import { SLUG_REGEX } from "#/lib/enums";
import { slugify } from "./slug";

test.each([
	["Ratón Óptico", "raton-optico"],
	["Teclado RK75 + Switches", "teclado-rk75-switches"],
	["  Ñandú   y  más  ", "nandu-y-mas"],
	["Set de mañana", "set-de-manana"],
	["---Dobles--guiones---", "dobles-guiones"],
	["", ""],
	["¿¡?!", ""],
])("%j is %j", (name, slug) => {
	expect(slugify(name)).toBe(slug);
});

test("a long name is cut at 80 characters without ending in a hyphen", () => {
	const slug = slugify(`${"a".repeat(79)} bbb`);
	expect(slug).toBe("a".repeat(79));
	expect(slugify("a".repeat(120))).toHaveLength(80);
});

test("what it makes is a slug the API accepts", () => {
	for (const name of ["Ratón Óptico", "RGB 65%+", "Ñandú", "x"])
		expect(SLUG_REGEX.test(slugify(name))).toBe(true);
});
