import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { m } from "#/paraglide/messages";
import {
	type AdjustmentDraft,
	checkAdjustment,
	signedQuantity,
} from "./adjustment-rules";

const loss: AdjustmentDraft = {
	kind: "waste",
	quantity: "3",
	reason: "damaged",
	note: "",
};

function issues(change: Partial<AdjustmentDraft>, available = 10) {
	const result = z
		.custom<AdjustmentDraft>()
		.superRefine((value, ctx) => checkAdjustment(value, ctx, available))
		.safeParse({ ...loss, ...change });
	return result.success
		? []
		: result.error.issues.map((i) => [i.path.join("."), i.message]);
}

describe("signedQuantity", () => {
	test("a loss takes units out whatever the sign typed", () => {
		expect(signedQuantity("waste", 3)).toBe(-3);
		expect(signedQuantity("waste", -3)).toBe(-3);
	});

	test("a count correction keeps its sign", () => {
		expect(signedQuantity("adjustment", 4)).toBe(4);
		expect(signedQuantity("adjustment", -4)).toBe(-4);
	});
});

describe("checkAdjustment", () => {
	test("finds nothing wrong with a loss or a correction the lot can take", () => {
		expect(issues({})).toEqual([]);
		expect(issues({ quantity: "10" })).toEqual([]);
		expect(issues({ kind: "adjustment", quantity: "-10" })).toEqual([]);
		expect(issues({ kind: "adjustment", quantity: "25" })).toEqual([]);
		expect(issues({ kind: "adjustment", quantity: "+2" })).toEqual([
			["quantity", m.admin_lot_adjust_units_invalid()],
		]);
	});

	test("refuses units that are not a whole number other than zero", () => {
		for (const quantity of ["", "0", "1.5", "ten", " "])
			expect(issues({ quantity })).toEqual([
				["quantity", m.admin_lot_adjust_units_invalid()],
			]);
		expect(issues({ kind: "adjustment", quantity: "0" })).toEqual([
			["quantity", m.admin_lot_adjust_units_invalid()],
		]);
		// A loss is typed in units that leave: no sign.
		expect(issues({ quantity: "-3" })).toEqual([
			["quantity", m.admin_lot_adjust_units_invalid()],
		]);
		expect(issues({ quantity: "100001" }, 200_000)).toEqual([
			["quantity", m.admin_lot_adjust_units_invalid()],
		]);
	});

	test("refuses to take more than the lot holds, a correction down included", () => {
		expect(issues({ quantity: "11" })).toEqual([
			["quantity", m.admin_lot_adjust_over({ available: 10 })],
		]);
		expect(issues({ kind: "adjustment", quantity: "-11" })).toEqual([
			["quantity", m.admin_lot_adjust_over({ available: 10 })],
		]);
		expect(issues({ quantity: "1" }, 0)).toEqual([
			["quantity", m.admin_lot_adjust_over({ available: 0 })],
		]);
	});

	test("asks for a note only when the reason is other", () => {
		expect(issues({ reason: "other" })).toEqual([
			["note", m.admin_lot_adjust_note_needed()],
		]);
		expect(issues({ reason: "other", note: "  " })).toEqual([
			["note", m.admin_lot_adjust_note_needed()],
		]);
		expect(issues({ reason: "other", note: "Left in the sun" })).toEqual([]);
		expect(issues({ reason: "damaged", note: "" })).toEqual([]);
	});

	test("finds both problems at once", () => {
		expect(issues({ reason: "other", quantity: "0" })).toEqual([
			["quantity", m.admin_lot_adjust_units_invalid()],
			["note", m.admin_lot_adjust_note_needed()],
		]);
	});
});
