import type { z } from "zod";
import { m } from "#/paraglide/messages";

// The API's limits for a purchase order's lines.
export const MAX_LINES = 100;
export const MAX_QUANTITY = 100_000;
const MAX_UNIT_COST = 100_000_000;

// `id` is the line of a draft that is kept; a new line has none.
export type PurchaseLine = {
	id: number | null;
	variantId: number;
	sku: string;
	label: string;
	quantity: string;
	unitCost: string;
};

type ParseMoney = (text: string) => number | null;

export function checkPurchaseLines(
	lines: PurchaseLine[],
	ctx: z.RefinementCtx,
	parse: ParseMoney,
) {
	if (lines.length === 0)
		ctx.addIssue({
			code: "custom",
			path: [],
			message: m.admin_purchase_needs_lines(),
		});
	if (lines.length > MAX_LINES)
		ctx.addIssue({
			code: "custom",
			path: [],
			message: m.admin_purchase_too_many_lines({ max: MAX_LINES }),
		});
	lines.forEach((line, index) => {
		const quantity = Number(line.quantity);
		if (
			!/^\d+$/.test(line.quantity.trim()) ||
			quantity < 1 ||
			quantity > MAX_QUANTITY
		)
			ctx.addIssue({
				code: "custom",
				path: ["lines", index, "quantity"],
				message: m.admin_purchase_invalid_quantity({ max: MAX_QUANTITY }),
			});
		const cost = parse(line.unitCost);
		if (cost === null || cost > MAX_UNIT_COST)
			ctx.addIssue({
				code: "custom",
				path: ["lines", index, "unitCost"],
				message: m.admin_invalid_amount(),
			});
	});
}

// Lines not fully typed count as 0, so the total follows the typing.
export function linesTotal(lines: PurchaseLine[], parse: ParseMoney) {
	return lines.reduce(
		(sum, line) =>
			sum + (Number(line.quantity) || 0) * (parse(line.unitCost) ?? 0),
		0,
	);
}

// Run after checkPurchaseLines.
export function toRequestItems(lines: PurchaseLine[], parse: ParseMoney) {
	return lines.map((line) => {
		const unitCost = parse(line.unitCost);
		if (unitCost === null) throw new Error(`Unchecked cost of ${line.sku}`);
		return {
			...(line.id === null ? {} : { id: line.id }),
			variantId: line.variantId,
			quantity: Number(line.quantity),
			unitCost,
		};
	});
}

export function lineFieldOf(path: string) {
	const match = /^items\.(\d+)\.(quantity|unitCost)$/.exec(path);
	return match ? (`lines[${match[1]}].${match[2]}` as const) : undefined;
}
