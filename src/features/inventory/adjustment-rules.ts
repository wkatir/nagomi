import type { z } from "zod";
import type { MovementReason } from "#/lib/enums";
import { m } from "#/paraglide/messages";

export type AdjustmentKind = "waste" | "adjustment";

export type AdjustmentDraft = {
	kind: AdjustmentKind;
	quantity: string;
	reason: MovementReason;
	note: string;
};

// The API's limit for one adjustment.
const MAX_UNITS = 100_000;

export const signedQuantity = (kind: AdjustmentKind, quantity: number) =>
	kind === "waste" ? -Math.abs(quantity) : quantity;

// The API enforces these rules again.
export function checkAdjustment(
	value: AdjustmentDraft,
	ctx: z.RefinementCtx,
	available: number,
) {
	const issue = (path: string, message: string) =>
		ctx.addIssue({ code: "custom", path: [path], message });
	const text = value.quantity.trim();
	const whole = (value.kind === "waste" ? /^\d+$/ : /^-?\d+$/).test(text);
	const units = Number(text);
	if (!whole || units === 0 || Math.abs(units) > MAX_UNITS)
		issue("quantity", m.admin_lot_adjust_units_invalid());
	else if (-signedQuantity(value.kind, units) > available)
		issue("quantity", m.admin_lot_adjust_over({ available }));
	if (value.reason === "other" && value.note.trim() === "")
		issue("note", m.admin_lot_adjust_note_needed());
}
