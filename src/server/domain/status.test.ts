import { expect, test } from "bun:test";
import { canMoveStatus } from "./status";

test("a draft is published or archived, a published one goes back to draft or is archived, an archived one returns to draft", () => {
	const allowed = [
		["draft", "published"],
		["draft", "archived"],
		["published", "draft"],
		["published", "archived"],
		["archived", "draft"],
	];
	const statuses = ["draft", "published", "archived"] as const;
	for (const from of statuses)
		for (const to of statuses)
			expect(canMoveStatus(from, to)).toBe(
				allowed.some(([a, b]) => a === from && b === to),
			);
});
