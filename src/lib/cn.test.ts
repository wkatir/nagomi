import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { cn } from "cn";

describe("the cn alias", () => {
	// bun and tsc read tsconfig paths, the bundler reads its own alias; losing either one
	// makes the generated components merge with the package's cn again, silently.
	test("points at src/lib/cn.ts in the type checker and in the bundler", () => {
		expect(readFileSync("tsconfig.json", "utf8")).toContain(
			'"cn": ["./src/lib/cn.ts"]',
		);
		expect(readFileSync("vite.config.ts", "utf8")).toContain(
			'"./src/lib/cn.ts"',
		);
	});
});

describe("cn with the type-* utilities", () => {
	test("a heading replaces the size, line height, tracking and weight a component brings", () => {
		expect(
			cn("text-lg leading-none font-semibold tracking-tight", "type-title"),
		).toBe("type-title");
	});

	test("a text size replaces the size a component brings", () => {
		expect(cn("text-sm", "type-small")).toBe("type-small");
		expect(cn("type-small", "type-meta")).toBe("type-meta");
		expect(cn("type-small", "text-base")).toBe("text-base");
	});

	test("a text size keeps the weight, which it does not set", () => {
		expect(cn("font-medium", "type-small")).toBe("font-medium type-small");
		expect(cn("type-small", "font-bold")).toBe("type-small font-bold");
	});

	test("a heading keeps the colour and a size from another breakpoint", () => {
		expect(cn("text-lg text-muted-foreground md:text-xl", "type-title")).toBe(
			"text-muted-foreground md:text-xl type-title",
		);
	});

	test("two headings keep the later one", () => {
		expect(cn("type-h2", "type-h3")).toBe("type-h3");
	});

	test("the Tailwind classes still merge as before", () => {
		expect(cn("h-9", "h-(--control-lg)")).toBe("h-(--control-lg)");
		expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
	});
});
