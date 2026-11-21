import { describe, expect, test } from "bun:test";
import { PROMOTION_STATUSES } from "#/lib/enums";
import { m } from "#/paraglide/messages";
import { statusMoves } from "./columns";

describe("statusMoves", () => {
	test("an active promotion can be turned off or archived", () => {
		expect(statusMoves.active.map((move) => move.to)).toEqual([
			"inactive",
			"archived",
		]);
		expect(statusMoves.active.map((move) => move.label())).toEqual([
			m.admin_promotion_deactivate(),
			m.admin_promotion_archive(),
		]);
	});

	test("an inactive one can be turned on or archived", () => {
		expect(statusMoves.inactive.map((move) => move.to)).toEqual([
			"active",
			"archived",
		]);
		expect(statusMoves.inactive.map((move) => move.label())).toEqual([
			m.admin_promotion_activate(),
			m.admin_promotion_archive(),
		]);
	});

	test("an archived one is restored as inactive, so it does not start applying by surprise", () => {
		expect(statusMoves.archived.map((move) => move.to)).toEqual(["inactive"]);
		expect(statusMoves.archived[0]?.label()).toBe(m.admin_promotion_restore());
	});

	test("no status moves to itself", () => {
		for (const status of PROMOTION_STATUSES)
			expect(statusMoves[status].map((move) => move.to)).not.toContain(status);
	});
});
