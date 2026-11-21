import { expect, test } from "bun:test";
import { sidebarOpenFrom } from "./sidebar-state";

test("the sidebar starts open until the user collapsed it", () => {
	expect(sidebarOpenFrom("")).toBe(true);
	expect(sidebarOpenFrom("theme=light; sidebar_state=true")).toBe(true);
	expect(sidebarOpenFrom("sidebar_state=false")).toBe(false);
	expect(sidebarOpenFrom("a=1; sidebar_state=false; b=2")).toBe(false);
});

test("a cookie that only looks like it does not collapse it", () => {
	expect(sidebarOpenFrom("other_sidebar_state=false")).toBe(true);
	expect(sidebarOpenFrom("sidebar_state=falsey")).toBe(true);
});
