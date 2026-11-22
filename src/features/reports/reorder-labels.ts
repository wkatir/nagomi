import { m } from "#/paraglide/messages";
import type { ReorderReport } from "./queries";

type Reason = ReorderReport["variants"][number]["reasons"][number];

export const reorderReasonLabel = {
	backordered: m.admin_report_reorder_reason_backordered,
	below_reorder_point: m.admin_report_reorder_reason_below_reorder_point,
	stockout_within_lead_time:
		m.admin_report_reorder_reason_stockout_within_lead_time,
	no_sales_in_lookback: m.admin_report_reorder_reason_no_sales_in_lookback,
	no_cost: m.admin_report_reorder_reason_no_cost,
	no_price: m.admin_report_reorder_reason_no_price,
	lead_time_unknown: m.admin_report_reorder_reason_lead_time_unknown,
	short_history: m.admin_report_reorder_reason_short_history,
	rounded_to_pack_or_minimum:
		m.admin_report_reorder_reason_rounded_to_pack_or_minimum,
} as const satisfies Record<Reason, () => string>;
