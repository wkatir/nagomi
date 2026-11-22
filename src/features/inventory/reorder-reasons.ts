import { m } from "#/paraglide/messages";
import type { Suggestion } from "./queries";

// Keyed by the report's reasons, so a new reason fails to compile here.
export const reorderReasonLabel: Record<
	Suggestion["reasons"][number],
	() => string
> = {
	backordered: m.admin_inventory_reason_backordered,
	below_reorder_point: m.admin_inventory_reason_below_reorder_point,
	stockout_within_lead_time: m.admin_inventory_reason_stockout_within_lead_time,
	no_sales_in_lookback: m.admin_inventory_reason_no_sales_in_lookback,
	no_cost: m.admin_inventory_reason_no_cost,
	no_price: m.admin_inventory_reason_no_price,
	lead_time_unknown: m.admin_inventory_reason_lead_time_unknown,
	short_history: m.admin_inventory_reason_short_history,
	rounded_to_pack_or_minimum:
		m.admin_inventory_reason_rounded_to_pack_or_minimum,
};
