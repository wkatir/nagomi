import type { z } from "zod";
import { isCalendarDate } from "#/lib/dates";
import { m } from "#/paraglide/messages";

export type ReceiptDraft = {
	receivedOn: string;
	shipping: string;
	lots: {
		purchaseOrderItemId: number;
		remaining: number;
		quantity: string;
	}[];
};

export function checkReceipt(
	value: ReceiptDraft,
	ctx: z.RefinementCtx,
	rules: {
		today: string;
		orderedOn: string | null;
		parseMoney: (text: string) => number | null;
	},
) {
	const issue = (path: (string | number)[], message: string) =>
		ctx.addIssue({ code: "custom", path, message });
	if (value.shipping.trim() === "") issue(["shipping"], m.admin_required());
	else if (rules.parseMoney(value.shipping) === null)
		issue(["shipping"], m.admin_invalid_amount());
	if (isCalendarDate(value.receivedOn)) {
		if (value.receivedOn > rules.today)
			issue(["receivedOn"], m.error_received_on_in_future());
		else if (rules.orderedOn && value.receivedOn < rules.orderedOn)
			issue(["receivedOn"], m.error_received_before_ordered());
	}
	if (value.lots.length === 0) issue([], m.admin_purchase_needs_lots());
	const arrived = new Map<number, number>();
	value.lots.forEach((lot, index) => {
		const quantity = Number(lot.quantity);
		if (!/^\d+$/.test(lot.quantity.trim()) || quantity < 1)
			issue(
				["lots", index, "quantity"],
				m.admin_purchase_invalid_quantity({ max: lot.remaining }),
			);
		else
			arrived.set(
				lot.purchaseOrderItemId,
				(arrived.get(lot.purchaseOrderItemId) ?? 0) + quantity,
			);
	});
	value.lots.forEach((lot, index) => {
		if ((arrived.get(lot.purchaseOrderItemId) ?? 0) > lot.remaining)
			issue(
				["lots", index, "quantity"],
				m.admin_purchase_over_remaining({ count: lot.remaining }),
			);
	});
}
