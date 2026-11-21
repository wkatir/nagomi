import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { parseMoney } from "#/lib/money";
import { m } from "#/paraglide/messages";
import { checkReceipt, hasShortLife, type ReceiptDraft } from "./receive-rules";

const rules = {
	today: "2026-10-24",
	orderedOn: "2026-10-20" as string | null,
	parseMoney: (text: string) => parseMoney(text, "USD"),
};

// A delivery that follows every rule: 10 of line 1 in one lot and 4 of line 2, both expiring.
const first = {
	purchaseOrderItemId: 1,
	remaining: 10,
	quantity: "10",
	expiresOn: "2027-05",
};
const second = {
	purchaseOrderItemId: 2,
	remaining: 4,
	quantity: "4",
	expiresOn: "2028-01-31",
};
const valid: ReceiptDraft = {
	receivedOn: "2026-10-24",
	shipping: "1.40",
	lots: [first, second],
};

function issues(change: Partial<ReceiptDraft>, given = rules) {
	const result = z
		.custom<ReceiptDraft>()
		.superRefine((value, ctx) => checkReceipt(value, ctx, given))
		.safeParse({ ...valid, ...change });
	return result.success
		? []
		: result.error.issues.map((i) => [i.path.join("."), i.message]);
}

describe("checkReceipt", () => {
	test("finds nothing wrong with a delivery that follows the rules", () => {
		expect(issues({})).toEqual([]);
		expect(issues({ shipping: "0" })).toEqual([]);
		expect(issues({ receivedOn: "2026-10-20" })).toEqual([]);
	});

	test("asks for the shipping, 0 included, and for an amount", () => {
		expect(issues({ shipping: "" })).toEqual([
			["shipping", m.admin_required()],
		]);
		expect(issues({ shipping: "  " })).toEqual([
			["shipping", m.admin_required()],
		]);
		expect(issues({ shipping: "twelve" })).toEqual([
			["shipping", m.admin_invalid_amount()],
		]);
	});

	test("refuses a day in the future or before the order was placed", () => {
		expect(issues({ receivedOn: "2026-10-25" })).toEqual([
			["receivedOn", m.error_received_on_in_future()],
		]);
		expect(issues({ receivedOn: "2026-10-19" })).toEqual([
			["receivedOn", m.error_received_before_ordered()],
		]);
	});

	test("takes any day not in the future when the order has no date to be compared with", () => {
		const undated = { ...rules, orderedOn: null };
		expect(issues({ receivedOn: "2026-01-01" }, undated)).toEqual([]);
		expect(issues({ receivedOn: "2026-10-25" }, undated)).toEqual([
			["receivedOn", m.error_received_on_in_future()],
		]);
	});

	test("asks for at least one lot", () => {
		expect(issues({ lots: [] })).toEqual([["", m.admin_purchase_needs_lots()]]);
	});

	test("refuses a quantity that is not a whole number of at least one", () => {
		for (const quantity of ["", "0", "-1", "1.5", "two"])
			expect(issues({ lots: [{ ...first, quantity }, second] })).toEqual([
				["lots.0.quantity", m.admin_purchase_invalid_quantity({ max: 10 })],
			]);
	});

	test("refuses a line receiving more than is still expected, also across its lots", () => {
		expect(issues({ lots: [{ ...first, quantity: "11" }, second] })).toEqual([
			["lots.0.quantity", m.admin_purchase_over_remaining({ count: 10 })],
		]);
		expect(
			issues({
				lots: [
					{ ...first, quantity: "6" },
					{ ...first, quantity: "6" },
					second,
				],
			}),
		).toEqual([
			["lots.0.quantity", m.admin_purchase_over_remaining({ count: 10 })],
			["lots.1.quantity", m.admin_purchase_over_remaining({ count: 10 })],
		]);
		expect(
			issues({
				lots: [
					{ ...first, quantity: "6" },
					{ ...first, quantity: "4" },
					second,
				],
			}),
		).toEqual([]);
	});

	test("counts each line apart: one line's units are not another's", () => {
		expect(
			issues({
				lots: [
					{ ...first, quantity: "10" },
					{ ...second, quantity: "5" },
				],
			}),
		).toEqual([
			["lots.1.quantity", m.admin_purchase_over_remaining({ count: 4 })],
		]);
	});

	test("refuses an expiry that is neither a day nor a month, or already past on arrival", () => {
		for (const expiresOn of ["", "2027", "2027-13", "2027-02-30", "soon"])
			expect(issues({ lots: [{ ...first, expiresOn }, second] })).toEqual([
				["lots.0.expiresOn", m.error_invalid_expiry()],
			]);
		expect(
			issues({ lots: [first, { ...second, expiresOn: "2026-10-23" }] }),
		).toEqual([["lots.1.expiresOn", m.error_lot_expired_at_receipt()]]);
		// A label that prints the month lasts to the end of it; the day it arrived is fine.
		expect(
			issues({ lots: [{ ...first, expiresOn: "2026-10" }, second] }),
		).toEqual([]);
		expect(
			issues({ lots: [first, { ...second, expiresOn: "2026-10-24" }] }),
		).toEqual([]);
	});
});

describe("hasShortLife", () => {
	test("is true for a lot that expires before the day it must outlast, a month by its last day", () => {
		expect(hasShortLife([{ expiresOn: "2027-03-31" }], "2027-04-01")).toBe(
			true,
		);
		expect(hasShortLife([{ expiresOn: "2027-03" }], "2027-04-01")).toBe(true);
		expect(hasShortLife([{ expiresOn: "2027-04" }], "2027-04-01")).toBe(false);
		expect(hasShortLife([{ expiresOn: "2027-04-01" }], "2027-04-01")).toBe(
			false,
		);
	});

	test("ignores an expiry still being typed, and looks at every lot", () => {
		expect(hasShortLife([{ expiresOn: "2027-0" }], "2027-04-01")).toBe(false);
		expect(hasShortLife([], "2027-04-01")).toBe(false);
		expect(
			hasShortLife(
				[{ expiresOn: "2028-01-01" }, { expiresOn: "2027-01-01" }],
				"2027-04-01",
			),
		).toBe(true);
	});
});
