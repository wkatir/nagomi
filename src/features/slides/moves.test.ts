import { describe, expect, test } from "bun:test";
import { m } from "#/paraglide/messages";
import { moveLabel, primaryMove, slideMoves } from "./moves";

describe("slideMoves", () => {
	test("follows the lifecycle of the API", () => {
		expect(slideMoves("draft")).toEqual(["published", "archived"]);
		expect(slideMoves("published")).toEqual(["draft", "archived"]);
		expect(slideMoves("archived")).toEqual(["draft"]);
	});
});

describe("moveLabel", () => {
	test("names each move by what it does to the slide", () => {
		expect(moveLabel("draft", "published")).toBe(m.admin_slide_publish());
		expect(moveLabel("published", "draft")).toBe(m.admin_slide_unpublish());
		expect(moveLabel("draft", "archived")).toBe(m.admin_slide_archive());
		expect(moveLabel("published", "archived")).toBe(m.admin_slide_archive());
		expect(moveLabel("archived", "draft")).toBe(m.admin_slide_restore());
	});

	test("the four names differ", () => {
		expect(
			new Set([
				m.admin_slide_publish(),
				m.admin_slide_unpublish(),
				m.admin_slide_archive(),
				m.admin_slide_restore(),
			]).size,
		).toBe(4);
	});
});

describe("primaryMove", () => {
	test("is publishing a draft and restoring an archived slide", () => {
		expect(primaryMove("draft")).toBe("published");
		expect(primaryMove("archived")).toBe("draft");
	});

	test("a published slide has no main move", () => {
		expect(primaryMove("published")).toBeUndefined();
	});

	test("the main move is always one the lifecycle allows", () => {
		for (const status of ["draft", "published", "archived"] as const) {
			const move = primaryMove(status);
			if (move) expect(slideMoves(status)).toContain(move);
		}
	});
});
