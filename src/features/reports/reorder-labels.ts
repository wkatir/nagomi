import { m } from "#/paraglide/messages";
import type { ReorderReport } from "./queries";

type Reason = ReorderReport["variants"][number]["reasons"][number];

export const reorderReasonLabel = {
	backordered: m.admin_report_reorder_reason_backordered,
	below_reorder_point: m.admin_report_reorder_reason_below_reorder_point,
	stockout_within_lead_time:
		m.admin_report_reorder_reason_stockout_within_lead_time,
	stock_expiring_unsold: m.admin_report_reorder_reason_stock_expiring_unsold,
	capped_by_shelf_life: m.admin_report_reorder_reason_capped_by_shelf_life,
	min_shelf_life_not_set: m.admin_report_reorder_reason_min_shelf_life_not_set,
	no_sales_in_lookback: m.admin_report_reorder_reason_no_sales_in_lookback,
	no_cost: m.admin_report_reorder_reason_no_cost,
	no_price: m.admin_report_reorder_reason_no_price,
	lead_time_unknown: m.admin_report_reorder_reason_lead_time_unknown,
	short_history: m.admin_report_reorder_reason_short_history,
	rounded_to_pack_or_minimum:
		m.admin_report_reorder_reason_rounded_to_pack_or_minimum,
	rounded_above_shelf_life_cap:
		m.admin_report_reorder_reason_rounded_above_shelf_life_cap,
} as const satisfies Record<Reason, () => string>;
