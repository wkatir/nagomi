import type { Database } from "bun:sqlite";
import { searchKey } from "../../domain/search";

// The store's time zone is El Salvador (UTC-6).
export function seedSupply(db: Database) {
	db.exec(`
insert into store_settings (id, name, currency, default_locale, time_zone, country_code, order_code_prefix, max_quantity_per_line, expiry_warning_days, min_shelf_life_days) values (1, 'Store', 'USD', 'es', 'America/El_Salvador', 'SV', 'ECL', 20, 90, 180);
insert into users (id, name, email) values ('admin', 'Admin', 'admin@example.com');
insert into brands (slug, name, search_key) values ('brand', 'Brand', 'brand');
insert into categories (slug, routine_step) values ('cleanser', 1);
insert into products (slug, brand_id, category_id) values ('oil', 1, 1), ('cream', 1, 1);
insert into product_translations (product_id, locale, name, search_key) values (1, 'es', 'Aceite', 'aceite'), (2, 'es', 'Crema', 'crema');
insert into variants (product_id, sku, search_key, size_value, size_unit, reorder_point) values (1, 'OIL-50', 'oil-50', 50, 'ml', 10), (1, 'OIL-100', 'oil-100', 100, 'ml', NULL), (2, 'CRM-30', 'crm-30', 30, 'ml', NULL);
`);
}

export const OIL_50 = 1;
export const OIL_100 = 2;
export const CRM_30 = 3;

export function addSupplier(
	db: Database,
	s: {
		name: string;
		contactName?: string;
		leadTimeDays?: number;
		status?: "active" | "archived";
		createdAt?: string;
	},
) {
	return Number(
		db
			.prepare(
				"insert into suppliers (name, contact_name, search_key, lead_time_days, status, created_at) values (?, ?, ?, ?, ?, ?)",
			)
			.run(
				s.name,
				s.contactName ?? null,
				searchKey(s.name, s.contactName),
				s.leadTimeDays ?? null,
				s.status ?? "active",
				s.createdAt ?? "2026-09-01T10:00:00Z",
			).lastInsertRowid,
	);
}

export type PurchaseLine = {
	variantId: number;
	quantity: number;
	unitCost: number;
	received?: number;
	lotCode?: string;
	expiresOn?: string;
};

// Written the way the API leaves it: placed, then received as far as its lines say, then
// cancelled or marked as received.
export function addPurchase(
	db: Database,
	o: {
		supplierId: number;
		reference: string;
		status?:
			| "draft"
			| "ordered"
			| "partially_received"
			| "received"
			| "cancelled";
		createdAt?: string;
		orderedOn?: string;
		// `at` is when the ledger noted the delivery.
		receipt?: {
			invoiceRef?: string;
			shippingCost?: number;
			notes?: string;
			at?: string;
		};
		items: PurchaseLine[];
	},
) {
	const status = o.status ?? "draft";
	const placed = status !== "draft" && status !== "cancelled";
	const id = Number(
		db
			.prepare(
				"insert into purchase_orders (supplier_id, reference, status, ordered_on, created_at, created_by) values (?, ?, ?, ?, ?, 'admin')",
			)
			.run(
				o.supplierId,
				o.reference,
				placed ? "ordered" : "draft",
				placed ? (o.orderedOn ?? "2026-10-01") : (o.orderedOn ?? null),
				o.createdAt ?? "2026-10-01T10:00:00Z",
			).lastInsertRowid,
	);
	const itemIds = o.items.map((item) =>
		Number(
			db
				.prepare(
					"insert into purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost) values (?, ?, ?, ?)",
				)
				.run(id, item.variantId, item.quantity, item.unitCost).lastInsertRowid,
		),
	);
	if (o.items.some((item) => item.received)) {
		const receiptId = Number(
			db
				.prepare(
					"insert into purchase_receipts (purchase_order_id, received_on, supplier_invoice_ref, shipping_cost, notes, created_by) values (?, ?, ?, ?, ?, 'admin')",
				)
				.run(
					id,
					o.orderedOn ?? "2026-10-02",
					o.receipt?.invoiceRef ?? null,
					o.receipt?.shippingCost ?? 0,
					o.receipt?.notes ?? null,
				).lastInsertRowid,
		);
		o.items.forEach((item, index) => {
			if (!item.received) return;
			const lineId = Number(
				db
					.prepare(
						"insert into purchase_receipt_lines (receipt_id, purchase_order_item_id, quantity, allocated_shipping_e4) values (?, ?, ?, 0)",
					)
					.run(receiptId, itemIds[index], item.received).lastInsertRowid,
			);
			const lotId = Number(
				db
					.prepare(
						"insert into lots (variant_id, receipt_line_id, code, expires_on, unit_cost_e4) values (?, ?, ?, ?, ?)",
					)
					.run(
						item.variantId,
						lineId,
						item.lotCode ?? null,
						item.expiresOn ?? "2099-12-31",
						item.unitCost * 100,
					).lastInsertRowid,
			);
			db.prepare(
				"insert into inventory_movements (lot_id, kind, quantity, created_by, created_at) values (?, 'receive', ?, 'admin', coalesce(?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')))",
			).run(lotId, item.received, o.receipt?.at ?? null);
		});
	}
	if (status !== "draft" && status !== "ordered")
		db.prepare("update purchase_orders set status = ? where id = ?").run(
			status,
			id,
		);
	return id;
}
