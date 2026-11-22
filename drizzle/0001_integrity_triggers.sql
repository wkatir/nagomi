-- Integrity rules drizzle-kit does not model. Each abort code a request can hit is
-- mapped to a 409 in src/server/domain/db-errors.ts. Written for the D1 statement
-- splitter: uppercase block keywords, no conditional expressions in trigger bodies, LF.

-- Stock ledger: append-only, and no lot balance below zero.
CREATE TRIGGER `inventory_movements_no_update` BEFORE UPDATE ON `inventory_movements`
BEGIN
	SELECT RAISE(ABORT, 'inventory_movements_append_only');
END;
--> statement-breakpoint
CREATE TRIGGER `inventory_movements_no_delete` BEFORE DELETE ON `inventory_movements`
BEGIN
	SELECT RAISE(ABORT, 'inventory_movements_append_only');
END;
--> statement-breakpoint
CREATE TRIGGER `inventory_movements_lot_not_negative` BEFORE INSERT ON `inventory_movements`
WHEN NEW.`quantity` < 0
	AND (SELECT coalesce(sum(`quantity`), 0) FROM `inventory_movements` WHERE `lot_id` = NEW.`lot_id`) + NEW.`quantity` < 0
BEGIN
	SELECT RAISE(ABORT, 'lot_balance_negative');
END;
--> statement-breakpoint
CREATE TRIGGER `inventory_movements_sale_order_confirmed` BEFORE INSERT ON `inventory_movements`
WHEN NEW.`kind` = 'sale'
	AND (SELECT o.`status` FROM `order_items` i JOIN `orders` o ON o.`id` = i.`order_id` WHERE i.`id` = NEW.`order_item_id`) <> 'confirmed'
BEGIN
	SELECT RAISE(ABORT, 'order_not_confirmed');
END;
--> statement-breakpoint
CREATE TRIGGER `inventory_movements_sale_within_line` BEFORE INSERT ON `inventory_movements`
WHEN NEW.`kind` = 'sale'
	AND (SELECT coalesce(-sum(`quantity`), 0) FROM `inventory_movements` WHERE `kind` = 'sale' AND `order_item_id` = NEW.`order_item_id`) - NEW.`quantity`
		> (SELECT `quantity` FROM `order_items` WHERE `id` = NEW.`order_item_id`)
BEGIN
	SELECT RAISE(ABORT, 'sale_exceeds_order_line');
END;
--> statement-breakpoint
CREATE TRIGGER `inventory_movements_sale_variant` BEFORE INSERT ON `inventory_movements`
WHEN NEW.`kind` = 'sale'
	AND (SELECT `variant_id` FROM `lots` WHERE `id` = NEW.`lot_id`) IS NOT (SELECT `variant_id` FROM `order_items` WHERE `id` = NEW.`order_item_id`)
BEGIN
	SELECT RAISE(ABORT, 'movement_variant_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `inventory_movements_return_lot` BEFORE INSERT ON `inventory_movements`
WHEN NEW.`return_line_id` IS NOT NULL
	AND (SELECT `lot_id` FROM `return_lines` WHERE `id` = NEW.`return_line_id`) IS NOT NEW.`lot_id`
BEGIN
	SELECT RAISE(ABORT, 'movement_lot_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `inventory_movements_receive_once` BEFORE INSERT ON `inventory_movements`
WHEN NEW.`kind` = 'receive'
	AND (EXISTS (SELECT 1 FROM `inventory_movements` WHERE `lot_id` = NEW.`lot_id` AND `kind` = 'receive')
		OR NEW.`quantity` IS NOT (SELECT rl.`quantity` FROM `lots` l JOIN `purchase_receipt_lines` rl ON rl.`id` = l.`receipt_line_id` WHERE l.`id` = NEW.`lot_id`))
BEGIN
	SELECT RAISE(ABORT, 'receive_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `inventory_movements_return_within_line` BEFORE INSERT ON `inventory_movements`
WHEN NEW.`kind` = 'return'
	AND (SELECT coalesce(sum(`quantity`), 0) FROM `inventory_movements` WHERE `kind` = 'return' AND `return_line_id` = NEW.`return_line_id`) + NEW.`quantity`
		> (SELECT `quantity` FROM `return_lines` WHERE `id` = NEW.`return_line_id`)
BEGIN
	SELECT RAISE(ABORT, 'return_movement_exceeds_line');
END;
--> statement-breakpoint
CREATE TRIGGER `inventory_movements_write_off_line` BEFORE INSERT ON `inventory_movements`
WHEN NEW.`kind` = 'waste' AND NEW.`return_line_id` IS NOT NULL
	AND ((SELECT `disposition` FROM `return_lines` WHERE `id` = NEW.`return_line_id`) IS NOT 'write_off'
		OR (SELECT coalesce(-sum(`quantity`), 0) FROM `inventory_movements` WHERE `kind` = 'waste' AND `return_line_id` = NEW.`return_line_id`) - NEW.`quantity`
			> (SELECT `quantity` FROM `return_lines` WHERE `id` = NEW.`return_line_id`))
BEGIN
	SELECT RAISE(ABORT, 'write_off_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `lots_cost_locked` BEFORE UPDATE OF `variant_id`, `receipt_line_id`, `unit_cost_e4` ON `lots`
WHEN NEW.`variant_id` IS NOT OLD.`variant_id`
	OR NEW.`receipt_line_id` IS NOT OLD.`receipt_line_id`
	OR NEW.`unit_cost_e4` IS NOT OLD.`unit_cost_e4`
BEGIN
	SELECT RAISE(ABORT, 'lots_cost_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `lots_variant_of_receipt_line` BEFORE INSERT ON `lots`
WHEN NEW.`variant_id` IS NOT (SELECT poi.`variant_id` FROM `purchase_receipt_lines` rl JOIN `purchase_order_items` poi ON poi.`id` = rl.`purchase_order_item_id` WHERE rl.`id` = NEW.`receipt_line_id`)
BEGIN
	SELECT RAISE(ABORT, 'lot_variant_mismatch');
END;
--> statement-breakpoint

-- Orders: the status machine of src/server/domain/order-state.ts, confirmation data,
-- terms fixed once confirmed, lines fixed once the order leaves pending, no empty order
-- confirmed or fulfilled.
CREATE TRIGGER `orders_start_pending` BEFORE INSERT ON `orders`
WHEN NEW.`status` <> 'pending'
	OR NEW.`confirmed_at` IS NOT NULL OR NEW.`fulfilled_at` IS NOT NULL
	OR NEW.`delivered_at` IS NOT NULL OR NEW.`cancelled_at` IS NOT NULL
	OR NEW.`confirmation_message` IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'order_must_start_pending');
END;
--> statement-breakpoint
CREATE TRIGGER `orders_identity_locked` BEFORE UPDATE ON `orders`
WHEN NEW.`code` IS NOT OLD.`code`
	OR NEW.`idempotency_key` IS NOT OLD.`idempotency_key`
	OR NEW.`request_hash` IS NOT OLD.`request_hash`
	OR NEW.`locale` IS NOT OLD.`locale`
	OR NEW.`channel` IS NOT OLD.`channel`
	OR NEW.`customer_phone` IS NOT OLD.`customer_phone`
	OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
	SELECT RAISE(ABORT, 'order_identity_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `orders_timestamps` BEFORE UPDATE ON `orders`
WHEN (NEW.`confirmed_at` IS NOT OLD.`confirmed_at` AND NOT (OLD.`confirmed_at` IS NULL AND OLD.`status` = 'pending' AND NEW.`status` = 'confirmed'))
	OR (NEW.`fulfilled_at` IS NOT OLD.`fulfilled_at` AND NOT (OLD.`fulfilled_at` IS NULL AND OLD.`status` = 'confirmed' AND NEW.`status` = 'fulfilled'))
	OR (NEW.`delivered_at` IS NOT OLD.`delivered_at` AND NOT (OLD.`delivered_at` IS NULL AND OLD.`status` = 'fulfilled' AND NEW.`status` = 'delivered'))
	OR (NEW.`cancelled_at` IS NOT OLD.`cancelled_at` AND NOT (OLD.`cancelled_at` IS NULL AND OLD.`status` <> 'cancelled' AND NEW.`status` = 'cancelled'))
BEGIN
	SELECT RAISE(ABORT, 'order_timestamps_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `orders_subtotal_matches_lines` BEFORE UPDATE OF `status` ON `orders`
WHEN OLD.`status` = 'pending' AND NEW.`status` = 'confirmed'
	AND NEW.`subtotal` IS NOT (SELECT coalesce(sum(`quantity` * `unit_price`), 0) FROM `order_items` WHERE `order_id` = NEW.`id`)
BEGIN
	SELECT RAISE(ABORT, 'order_subtotal_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `orders_require_lines` BEFORE UPDATE OF `status` ON `orders`
WHEN NEW.`status` <> OLD.`status` AND NEW.`status` IN ('confirmed', 'fulfilled')
	AND NOT EXISTS (SELECT 1 FROM `order_items` WHERE `order_id` = NEW.`id`)
BEGIN
	SELECT RAISE(ABORT, 'order_has_no_lines');
END;
--> statement-breakpoint
CREATE TRIGGER `orders_status_transition` BEFORE UPDATE OF `status` ON `orders`
WHEN NEW.`status` <> OLD.`status` AND NOT (
	(OLD.`status` = 'pending' AND NEW.`status` IN ('confirmed', 'cancelled'))
	OR (OLD.`status` = 'confirmed' AND NEW.`status` IN ('fulfilled', 'cancelled'))
	OR (OLD.`status` = 'fulfilled' AND NEW.`status` IN ('delivered', 'cancelled'))
)
BEGIN
	SELECT RAISE(ABORT, 'invalid_order_transition');
END;
--> statement-breakpoint
CREATE TRIGGER `orders_status_data` BEFORE UPDATE OF `status` ON `orders`
WHEN NEW.`status` <> OLD.`status` AND (
	(NEW.`status` = 'confirmed' AND (NEW.`confirmed_at` IS NULL OR NEW.`payment_method` IS NULL OR NEW.`shipping_method` IS NULL OR NEW.`delivery_estimate_from` IS NULL OR NEW.`confirmation_message` IS NULL))
	OR (NEW.`status` = 'fulfilled' AND NEW.`fulfilled_at` IS NULL)
	OR (NEW.`status` = 'delivered' AND NEW.`delivered_at` IS NULL)
	OR (NEW.`status` = 'cancelled' AND NEW.`cancelled_at` IS NULL)
)
BEGIN
	SELECT RAISE(ABORT, 'order_status_data_missing');
END;
--> statement-breakpoint
CREATE TRIGGER `orders_cancel_fulfilled_returned` BEFORE UPDATE OF `status` ON `orders`
WHEN OLD.`status` = 'fulfilled' AND NEW.`status` = 'cancelled'
	AND (SELECT coalesce(-sum(m.`quantity`), 0) FROM `inventory_movements` m JOIN `order_items` i ON i.`id` = m.`order_item_id` WHERE m.`kind` = 'sale' AND i.`order_id` = NEW.`id`)
		> (SELECT coalesce(sum(rl.`quantity`), 0) FROM `return_lines` rl JOIN `returns` r ON r.`id` = rl.`return_id` WHERE r.`order_id` = NEW.`id`)
BEGIN
	SELECT RAISE(ABORT, 'order_units_not_returned');
END;
--> statement-breakpoint
CREATE TRIGGER `orders_terms_locked` BEFORE UPDATE ON `orders`
WHEN OLD.`status` <> 'pending' AND (
	NEW.`subtotal` IS NOT OLD.`subtotal`
	OR NEW.`discount` IS NOT OLD.`discount`
	OR NEW.`shipping` IS NOT OLD.`shipping`
	OR NEW.`total` IS NOT OLD.`total`
	OR NEW.`payment_method` IS NOT OLD.`payment_method`
	OR NEW.`shipping_method` IS NOT OLD.`shipping_method`
	OR NEW.`shipping_zone_id` IS NOT OLD.`shipping_zone_id`
	OR NEW.`delivery_estimate_from` IS NOT OLD.`delivery_estimate_from`
	OR NEW.`delivery_estimate_to` IS NOT OLD.`delivery_estimate_to`
	OR NEW.`confirmation_message` IS NOT OLD.`confirmation_message`
	OR NEW.`confirmed_at` IS NOT OLD.`confirmed_at`
	OR NEW.`ship_to` IS NOT OLD.`ship_to`
	OR NEW.`shipping_zone_name` IS NOT OLD.`shipping_zone_name`
	OR NEW.`discount_reason` IS NOT OLD.`discount_reason`
	OR NEW.`customer_name` IS NOT OLD.`customer_name`
)
BEGIN
	SELECT RAISE(ABORT, 'order_terms_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `order_items_locked_insert` BEFORE INSERT ON `order_items`
WHEN (SELECT `status` FROM `orders` WHERE `id` = NEW.`order_id`) <> 'pending'
BEGIN
	SELECT RAISE(ABORT, 'order_items_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `order_items_locked_update` BEFORE UPDATE ON `order_items`
WHEN (SELECT `status` FROM `orders` WHERE `id` = OLD.`order_id`) <> 'pending'
	OR NEW.`order_id` IS NOT OLD.`order_id`
BEGIN
	SELECT RAISE(ABORT, 'order_items_locked');
END;
--> statement-breakpoint

-- Payments: final once out of pending, refunds never above confirmed payments.
CREATE TRIGGER `payments_final` BEFORE UPDATE ON `payments`
WHEN OLD.`status` <> 'pending'
	OR NEW.`order_id` IS NOT OLD.`order_id`
	OR NEW.`kind` IS NOT OLD.`kind`
	OR NEW.`method` IS NOT OLD.`method`
	OR NEW.`amount` IS NOT OLD.`amount`
	OR NEW.`return_id` IS NOT OLD.`return_id`
	OR NEW.`recorded_at` IS NOT OLD.`recorded_at`
	OR NEW.`recorded_by` IS NOT OLD.`recorded_by`
BEGIN
	SELECT RAISE(ABORT, 'payment_is_final');
END;
--> statement-breakpoint
CREATE TRIGGER `payments_refund_within_paid_insert` BEFORE INSERT ON `payments`
WHEN NEW.`kind` = 'refund' AND NEW.`status` = 'confirmed'
	AND (SELECT coalesce(sum(`amount`), 0) FROM `payments` WHERE `order_id` = NEW.`order_id` AND `kind` = 'refund' AND `status` = 'confirmed') + NEW.`amount`
		> (SELECT coalesce(sum(`amount`), 0) FROM `payments` WHERE `order_id` = NEW.`order_id` AND `kind` = 'payment' AND `status` = 'confirmed')
BEGIN
	SELECT RAISE(ABORT, 'refund_exceeds_paid');
END;
--> statement-breakpoint
CREATE TRIGGER `payments_refund_within_paid_update` BEFORE UPDATE OF `status` ON `payments`
WHEN NEW.`kind` = 'refund' AND NEW.`status` = 'confirmed' AND OLD.`status` <> 'confirmed'
	AND (SELECT coalesce(sum(`amount`), 0) FROM `payments` WHERE `order_id` = NEW.`order_id` AND `kind` = 'refund' AND `status` = 'confirmed') + NEW.`amount`
		> (SELECT coalesce(sum(`amount`), 0) FROM `payments` WHERE `order_id` = NEW.`order_id` AND `kind` = 'payment' AND `status` = 'confirmed')
BEGIN
	SELECT RAISE(ABORT, 'refund_exceeds_paid');
END;
--> statement-breakpoint

CREATE TRIGGER `payments_return_same_order` BEFORE INSERT ON `payments`
WHEN NEW.`return_id` IS NOT NULL
	AND (SELECT `order_id` FROM `returns` WHERE `id` = NEW.`return_id`) IS NOT NEW.`order_id`
BEGIN
	SELECT RAISE(ABORT, 'refund_wrong_return');
END;
--> statement-breakpoint

-- Returns: only from shipped orders, of units that left that lot for that line.
CREATE TRIGGER `returns_no_update` BEFORE UPDATE ON `returns`
BEGIN
	SELECT RAISE(ABORT, 'returns_are_permanent');
END;
--> statement-breakpoint
CREATE TRIGGER `returns_shipped_order` BEFORE INSERT ON `returns`
WHEN (SELECT `status` FROM `orders` WHERE `id` = NEW.`order_id`) NOT IN ('fulfilled', 'delivered')
BEGIN
	SELECT RAISE(ABORT, 'return_requires_shipped_order');
END;
--> statement-breakpoint
CREATE TRIGGER `return_lines_same_order` BEFORE INSERT ON `return_lines`
WHEN (SELECT `order_id` FROM `order_items` WHERE `id` = NEW.`order_item_id`) IS NOT (SELECT `order_id` FROM `returns` WHERE `id` = NEW.`return_id`)
BEGIN
	SELECT RAISE(ABORT, 'return_line_wrong_order');
END;
--> statement-breakpoint
CREATE TRIGGER `return_lines_within_sold` BEFORE INSERT ON `return_lines`
WHEN (SELECT coalesce(sum(`quantity`), 0) FROM `return_lines` WHERE `order_item_id` = NEW.`order_item_id` AND `lot_id` = NEW.`lot_id`) + NEW.`quantity`
	> (SELECT coalesce(-sum(`quantity`), 0) FROM `inventory_movements` WHERE `kind` = 'sale' AND `order_item_id` = NEW.`order_item_id` AND `lot_id` = NEW.`lot_id`)
BEGIN
	SELECT RAISE(ABORT, 'return_exceeds_sold');
END;
--> statement-breakpoint
CREATE TRIGGER `return_lines_no_update` BEFORE UPDATE ON `return_lines`
BEGIN
	SELECT RAISE(ABORT, 'return_lines_are_permanent');
END;
--> statement-breakpoint

-- Purchasing: status machine, new orders only with active suppliers, receipts only into
-- open orders and never beyond what was ordered, lines fixed once receiving started.
CREATE TRIGGER `purchase_orders_status_transition` BEFORE UPDATE OF `status` ON `purchase_orders`
WHEN NEW.`status` <> OLD.`status` AND NOT (
	(OLD.`status` = 'draft' AND NEW.`status` IN ('ordered', 'cancelled'))
	OR (OLD.`status` = 'ordered' AND NEW.`status` IN ('partially_received', 'received', 'cancelled'))
	OR (OLD.`status` = 'partially_received' AND NEW.`status` IN ('received', 'cancelled'))
)
BEGIN
	SELECT RAISE(ABORT, 'invalid_purchase_order_transition');
END;
--> statement-breakpoint
CREATE TRIGGER `purchase_orders_active_supplier_insert` BEFORE INSERT ON `purchase_orders`
WHEN (SELECT `status` FROM `suppliers` WHERE `id` = NEW.`supplier_id`) IS NOT 'active'
BEGIN
	SELECT RAISE(ABORT, 'supplier_archived');
END;
--> statement-breakpoint
CREATE TRIGGER `purchase_orders_active_supplier_update` BEFORE UPDATE OF `supplier_id`, `status` ON `purchase_orders`
WHEN (NEW.`supplier_id` IS NOT OLD.`supplier_id` OR (OLD.`status` = 'draft' AND NEW.`status` = 'ordered'))
	AND (SELECT `status` FROM `suppliers` WHERE `id` = NEW.`supplier_id`) IS NOT 'active'
BEGIN
	SELECT RAISE(ABORT, 'supplier_archived');
END;
--> statement-breakpoint
CREATE TRIGGER `purchase_order_items_locked_insert` BEFORE INSERT ON `purchase_order_items`
WHEN (SELECT `status` FROM `purchase_orders` WHERE `id` = NEW.`purchase_order_id`) NOT IN ('draft', 'ordered')
BEGIN
	SELECT RAISE(ABORT, 'purchase_order_items_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `purchase_order_items_locked_update` BEFORE UPDATE ON `purchase_order_items`
WHEN (SELECT `status` FROM `purchase_orders` WHERE `id` = OLD.`purchase_order_id`) NOT IN ('draft', 'ordered')
	OR NEW.`purchase_order_id` IS NOT OLD.`purchase_order_id`
	OR NEW.`quantity` < (SELECT coalesce(sum(`quantity`), 0) FROM `purchase_receipt_lines` WHERE `purchase_order_item_id` = OLD.`id`)
BEGIN
	SELECT RAISE(ABORT, 'purchase_order_items_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `purchase_orders_status_matches_receipts` BEFORE UPDATE OF `status` ON `purchase_orders`
WHEN NEW.`status` <> OLD.`status` AND (
	(NEW.`status` = 'received' AND EXISTS (SELECT 1 FROM `purchase_order_items` poi WHERE poi.`purchase_order_id` = NEW.`id` AND poi.`quantity` > (SELECT coalesce(sum(rl.`quantity`), 0) FROM `purchase_receipt_lines` rl WHERE rl.`purchase_order_item_id` = poi.`id`)))
	OR (NEW.`status` = 'partially_received' AND NOT EXISTS (SELECT 1 FROM `purchase_receipts` WHERE `purchase_order_id` = NEW.`id`))
)
BEGIN
	SELECT RAISE(ABORT, 'purchase_order_status_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `purchase_receipts_locked` BEFORE UPDATE ON `purchase_receipts`
WHEN NEW.`purchase_order_id` IS NOT OLD.`purchase_order_id`
	OR NEW.`received_on` IS NOT OLD.`received_on`
	OR NEW.`shipping_cost` IS NOT OLD.`shipping_cost`
	OR NEW.`created_at` IS NOT OLD.`created_at`
	OR NEW.`created_by` IS NOT OLD.`created_by`
BEGIN
	SELECT RAISE(ABORT, 'purchase_receipts_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `purchase_receipts_open_order` BEFORE INSERT ON `purchase_receipts`
WHEN (SELECT `status` FROM `purchase_orders` WHERE `id` = NEW.`purchase_order_id`) NOT IN ('ordered', 'partially_received')
BEGIN
	SELECT RAISE(ABORT, 'purchase_order_not_open');
END;
--> statement-breakpoint
CREATE TRIGGER `purchase_receipt_lines_same_order` BEFORE INSERT ON `purchase_receipt_lines`
WHEN (SELECT `purchase_order_id` FROM `purchase_order_items` WHERE `id` = NEW.`purchase_order_item_id`) IS NOT (SELECT `purchase_order_id` FROM `purchase_receipts` WHERE `id` = NEW.`receipt_id`)
BEGIN
	SELECT RAISE(ABORT, 'receipt_line_wrong_order');
END;
--> statement-breakpoint
CREATE TRIGGER `purchase_receipt_lines_within_ordered` BEFORE INSERT ON `purchase_receipt_lines`
WHEN (SELECT coalesce(sum(`quantity`), 0) FROM `purchase_receipt_lines` WHERE `purchase_order_item_id` = NEW.`purchase_order_item_id`) + NEW.`quantity`
	> (SELECT `quantity` FROM `purchase_order_items` WHERE `id` = NEW.`purchase_order_item_id`)
BEGIN
	SELECT RAISE(ABORT, 'receipt_exceeds_ordered');
END;
--> statement-breakpoint
CREATE TRIGGER `purchase_receipt_lines_no_update` BEFORE UPDATE ON `purchase_receipt_lines`
BEGIN
	SELECT RAISE(ABORT, 'purchase_receipt_lines_are_permanent');
END;
--> statement-breakpoint

-- Catalogue: a published product always has an active variant with a price, a variant
-- stays with its product, an image's file never changes and its variant belongs to its
-- product. Catalogue rows are archived, never deleted.
CREATE TRIGGER `products_publish_requires_price_insert` BEFORE INSERT ON `products`
WHEN NEW.`status` = 'published'
	AND NOT EXISTS (SELECT 1 FROM `variants` WHERE `product_id` = NEW.`id` AND `status` = 'active' AND `price` IS NOT NULL)
BEGIN
	SELECT RAISE(ABORT, 'published_product_requires_price');
END;
--> statement-breakpoint
CREATE TRIGGER `products_publish_requires_price` BEFORE UPDATE OF `status` ON `products`
WHEN NEW.`status` = 'published'
	AND NOT EXISTS (SELECT 1 FROM `variants` WHERE `product_id` = NEW.`id` AND `status` = 'active' AND `price` IS NOT NULL)
BEGIN
	SELECT RAISE(ABORT, 'published_product_requires_price');
END;
--> statement-breakpoint
CREATE TRIGGER `variants_published_price_insert` BEFORE INSERT ON `variants`
WHEN NEW.`status` = 'active' AND NEW.`price` IS NULL
	AND (SELECT `status` FROM `products` WHERE `id` = NEW.`product_id`) = 'published'
BEGIN
	SELECT RAISE(ABORT, 'published_variant_requires_price');
END;
--> statement-breakpoint
CREATE TRIGGER `variants_published_price_update` BEFORE UPDATE OF `price`, `status` ON `variants`
WHEN NEW.`status` = 'active' AND NEW.`price` IS NULL
	AND (SELECT `status` FROM `products` WHERE `id` = NEW.`product_id`) = 'published'
BEGIN
	SELECT RAISE(ABORT, 'published_variant_requires_price');
END;
--> statement-breakpoint
CREATE TRIGGER `variants_published_keeps_one` BEFORE UPDATE OF `price`, `status` ON `variants`
WHEN NOT (NEW.`status` = 'active' AND NEW.`price` IS NOT NULL)
	AND (SELECT `status` FROM `products` WHERE `id` = NEW.`product_id`) = 'published'
	AND NOT EXISTS (SELECT 1 FROM `variants` WHERE `product_id` = NEW.`product_id` AND `id` <> NEW.`id` AND `status` = 'active' AND `price` IS NOT NULL)
BEGIN
	SELECT RAISE(ABORT, 'published_product_requires_price');
END;
--> statement-breakpoint

CREATE TRIGGER `variants_product_locked` BEFORE UPDATE OF `product_id` ON `variants`
WHEN NEW.`product_id` IS NOT OLD.`product_id`
BEGIN
	SELECT RAISE(ABORT, 'variants_product_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `product_images_variant_insert` BEFORE INSERT ON `product_images`
WHEN NEW.`variant_id` IS NOT NULL
	AND (SELECT `product_id` FROM `variants` WHERE `id` = NEW.`variant_id`) IS NOT NEW.`product_id`
BEGIN
	SELECT RAISE(ABORT, 'image_variant_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `product_images_variant_update` BEFORE UPDATE OF `variant_id` ON `product_images`
WHEN NEW.`variant_id` IS NOT NULL
	AND (SELECT `product_id` FROM `variants` WHERE `id` = NEW.`variant_id`) IS NOT NEW.`product_id`
BEGIN
	SELECT RAISE(ABORT, 'image_variant_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `product_images_file_locked` BEFORE UPDATE ON `product_images`
WHEN NEW.`product_id` IS NOT OLD.`product_id`
	OR NEW.`media_file_id` IS NOT OLD.`media_file_id`
	OR NEW.`created_at` IS NOT OLD.`created_at`
	OR NEW.`created_by` IS NOT OLD.`created_by`
BEGIN
	SELECT RAISE(ABORT, 'product_images_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `product_images_no_delete` BEFORE DELETE ON `product_images`
BEGIN
	SELECT RAISE(ABORT, 'product_images_are_archived');
END;
--> statement-breakpoint
CREATE TRIGGER `brands_no_delete` BEFORE DELETE ON `brands`
BEGIN
	SELECT RAISE(ABORT, 'brands_are_archived');
END;
--> statement-breakpoint
CREATE TRIGGER `categories_no_delete` BEFORE DELETE ON `categories`
BEGIN
	SELECT RAISE(ABORT, 'categories_are_archived');
END;
--> statement-breakpoint
CREATE TRIGGER `bundles_no_delete` BEFORE DELETE ON `bundles`
BEGIN
	SELECT RAISE(ABORT, 'bundles_are_archived');
END;
--> statement-breakpoint
CREATE TRIGGER `suppliers_no_delete` BEFORE DELETE ON `suppliers`
BEGIN
	SELECT RAISE(ABORT, 'suppliers_are_archived');
END;
--> statement-breakpoint
CREATE TRIGGER `products_no_delete` BEFORE DELETE ON `products`
BEGIN
	SELECT RAISE(ABORT, 'products_are_archived');
END;
--> statement-breakpoint
CREATE TRIGGER `variants_no_delete` BEFORE DELETE ON `variants`
BEGIN
	SELECT RAISE(ABORT, 'variants_are_archived');
END;
--> statement-breakpoint
CREATE TRIGGER `page_versions_no_update` BEFORE UPDATE ON `page_versions`
BEGIN
	SELECT RAISE(ABORT, 'page_versions_append_only');
END;
--> statement-breakpoint
CREATE TRIGGER `page_versions_no_delete` BEFORE DELETE ON `page_versions`
BEGIN
	SELECT RAISE(ABORT, 'page_versions_append_only');
END;
--> statement-breakpoint

-- Records kept for 10 years (consumer and tax law): never deleted (lines of pending
-- orders and draft purchase orders excepted). Audit events and consents are not
-- rewritten, except that a consent gets its customer once its order is linked to one.
-- A consent points at the page its purpose is about: terms at the terms, the privacy
-- notice and marketing permissions at the privacy notice.
CREATE TRIGGER `orders_no_delete` BEFORE DELETE ON `orders`
BEGIN
	SELECT RAISE(ABORT, 'orders_are_permanent');
END;
--> statement-breakpoint
CREATE TRIGGER `order_items_no_delete` BEFORE DELETE ON `order_items`
WHEN (SELECT `status` FROM `orders` WHERE `id` = OLD.`order_id`) IS NOT 'pending'
BEGIN
	SELECT RAISE(ABORT, 'order_items_are_permanent');
END;
--> statement-breakpoint
CREATE TRIGGER `payments_no_delete` BEFORE DELETE ON `payments`
BEGIN
	SELECT RAISE(ABORT, 'payments_are_permanent');
END;
--> statement-breakpoint
CREATE TRIGGER `returns_no_delete` BEFORE DELETE ON `returns`
BEGIN
	SELECT RAISE(ABORT, 'returns_are_permanent');
END;
--> statement-breakpoint
CREATE TRIGGER `return_lines_no_delete` BEFORE DELETE ON `return_lines`
BEGIN
	SELECT RAISE(ABORT, 'return_lines_are_permanent');
END;
--> statement-breakpoint
CREATE TRIGGER `purchase_orders_no_delete` BEFORE DELETE ON `purchase_orders`
BEGIN
	SELECT RAISE(ABORT, 'purchase_orders_are_permanent');
END;
--> statement-breakpoint
CREATE TRIGGER `purchase_order_items_no_delete` BEFORE DELETE ON `purchase_order_items`
WHEN (SELECT `status` FROM `purchase_orders` WHERE `id` = OLD.`purchase_order_id`) IS NOT 'draft'
BEGIN
	SELECT RAISE(ABORT, 'purchase_order_items_are_permanent');
END;
--> statement-breakpoint
CREATE TRIGGER `purchase_receipts_no_delete` BEFORE DELETE ON `purchase_receipts`
BEGIN
	SELECT RAISE(ABORT, 'purchase_receipts_are_permanent');
END;
--> statement-breakpoint
CREATE TRIGGER `purchase_receipt_lines_no_delete` BEFORE DELETE ON `purchase_receipt_lines`
BEGIN
	SELECT RAISE(ABORT, 'purchase_receipt_lines_are_permanent');
END;
--> statement-breakpoint
CREATE TRIGGER `lots_no_delete` BEFORE DELETE ON `lots`
BEGIN
	SELECT RAISE(ABORT, 'lots_are_permanent');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_events_no_update` BEFORE UPDATE ON `audit_events`
BEGIN
	SELECT RAISE(ABORT, 'audit_events_append_only');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_events_no_delete` BEFORE DELETE ON `audit_events`
BEGIN
	SELECT RAISE(ABORT, 'audit_events_append_only');
END;
--> statement-breakpoint
CREATE TRIGGER `customer_consents_no_update` BEFORE UPDATE ON `customer_consents`
WHEN NOT (OLD.`customer_id` IS NULL AND NEW.`customer_id` IS NOT NULL)
	OR NEW.`order_id` IS NOT OLD.`order_id`
	OR NEW.`purpose` IS NOT OLD.`purpose`
	OR NEW.`granted` IS NOT OLD.`granted`
	OR NEW.`page_version_id` IS NOT OLD.`page_version_id`
	OR NEW.`channel` IS NOT OLD.`channel`
	OR NEW.`recorded_at` IS NOT OLD.`recorded_at`
	OR NEW.`recorded_by` IS NOT OLD.`recorded_by`
BEGIN
	SELECT RAISE(ABORT, 'customer_consents_append_only');
END;
--> statement-breakpoint
CREATE TRIGGER `customer_consents_page_matches_purpose` BEFORE INSERT ON `customer_consents`
WHEN (NEW.`purpose` = 'terms'
		AND (SELECT p.`slug` FROM `page_versions` v JOIN `pages` p ON p.`id` = v.`page_id` WHERE v.`id` = NEW.`page_version_id`) IS NOT 'terms')
	OR (NEW.`purpose` <> 'terms'
		AND (SELECT p.`slug` FROM `page_versions` v JOIN `pages` p ON p.`id` = v.`page_id` WHERE v.`id` = NEW.`page_version_id`) IS NOT 'privacy')
BEGIN
	SELECT RAISE(ABORT, 'consent_page_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `customer_consents_no_delete` BEFORE DELETE ON `customer_consents`
BEGIN
	SELECT RAISE(ABORT, 'customer_consents_append_only');
END;
--> statement-breakpoint

-- Supplier items: one row per supplier and variant, archived instead of deleted, only
-- created for an active supplier.
CREATE TRIGGER `supplier_items_identity_locked` BEFORE UPDATE ON `supplier_items`
WHEN NEW.`supplier_id` IS NOT OLD.`supplier_id`
	OR NEW.`variant_id` IS NOT OLD.`variant_id`
	OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
	SELECT RAISE(ABORT, 'supplier_items_identity_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `supplier_items_active_supplier_insert` BEFORE INSERT ON `supplier_items`
WHEN (SELECT `status` FROM `suppliers` WHERE `id` = NEW.`supplier_id`) IS NOT 'active'
BEGIN
	SELECT RAISE(ABORT, 'supplier_archived');
END;
--> statement-breakpoint
CREATE TRIGGER `supplier_items_no_delete` BEFORE DELETE ON `supplier_items`
BEGIN
	SELECT RAISE(ABORT, 'supplier_items_are_archived');
END;
--> statement-breakpoint

-- Audit events of an order's payments and returns carry the order id in their data; the
-- order detail finds them through this index (drizzle-kit cannot write expression indexes).
CREATE INDEX `audit_events_order_idx` ON `audit_events` (json_extract(`data`, '$.orderId'));
--> statement-breakpoint

-- Integrity rules of collections, home slides, media files and promotions that drizzle-kit
-- does not model. Each abort code a request can hit is mapped in
-- src/server/domain/db-errors.ts. Written for the D1 statement splitter: uppercase block
-- keywords, no conditional expressions in trigger bodies, LF.

-- Media files: a key always names the same bytes.
CREATE TRIGGER `media_files_locked` BEFORE UPDATE ON `media_files`
BEGIN
	SELECT RAISE(ABORT, 'media_files_are_permanent');
END;
--> statement-breakpoint
CREATE TRIGGER `media_files_no_delete` BEFORE DELETE ON `media_files`
BEGIN
	SELECT RAISE(ABORT, 'media_files_are_permanent');
END;
--> statement-breakpoint

-- Collections, slides and promotions are archived, never deleted. An archived product is
-- not added to a collection.
CREATE TRIGGER `collections_no_delete` BEFORE DELETE ON `collections`
BEGIN
	SELECT RAISE(ABORT, 'collections_are_archived');
END;
--> statement-breakpoint
CREATE TRIGGER `home_slides_no_delete` BEFORE DELETE ON `home_slides`
BEGIN
	SELECT RAISE(ABORT, 'home_slides_are_archived');
END;
--> statement-breakpoint
CREATE TRIGGER `promotions_no_delete` BEFORE DELETE ON `promotions`
BEGIN
	SELECT RAISE(ABORT, 'promotions_are_archived');
END;
--> statement-breakpoint
CREATE TRIGGER `collection_products_product_available` BEFORE INSERT ON `collection_products`
WHEN (SELECT `status` FROM `products` WHERE `id` = NEW.`product_id`) = 'archived'
BEGIN
	SELECT RAISE(ABORT, 'collection_product_archived');
END;
--> statement-breakpoint

-- Promotions: once an order used a code, the code and its terms are fixed, so the order's
-- discount stays derivable from them.
CREATE TRIGGER `promotions_terms_locked` BEFORE UPDATE OF `code`, `type`, `value`, `min_subtotal` ON `promotions`
WHEN (NEW.`code` IS NOT OLD.`code` OR NEW.`type` IS NOT OLD.`type`
		OR NEW.`value` IS NOT OLD.`value` OR NEW.`min_subtotal` IS NOT OLD.`min_subtotal`)
	AND EXISTS (SELECT 1 FROM `orders` WHERE `promotion_id` = OLD.`id`)
BEGIN
	SELECT RAISE(ABORT, 'promotion_terms_locked');
END;
--> statement-breakpoint

-- An order placed with a code: the promotion is active and within its limits (orders that
-- used it and were not cancelled, in total and per phone), and the discount is the code's:
-- a percentage of the subtotal rounded half up, or the fixed amount up to the subtotal,
-- once the subtotal reaches the minimum. A concurrent retry of an existing order (same
-- idempotency key) is left to its ON CONFLICT DO NOTHING. Dates are local days of the
-- store, checked by the API.
CREATE TRIGGER `orders_promotion_active` BEFORE INSERT ON `orders`
WHEN NEW.`promotion_id` IS NOT NULL
	AND NOT EXISTS (SELECT 1 FROM `orders` WHERE `idempotency_key` = NEW.`idempotency_key`)
	AND (SELECT `status` FROM `promotions` WHERE `id` = NEW.`promotion_id`) IS NOT 'active'
BEGIN
	SELECT RAISE(ABORT, 'promotion_inactive');
END;
--> statement-breakpoint
CREATE TRIGGER `orders_promotion_usage_limit` BEFORE INSERT ON `orders`
WHEN NEW.`promotion_id` IS NOT NULL
	AND NOT EXISTS (SELECT 1 FROM `orders` WHERE `idempotency_key` = NEW.`idempotency_key`)
	AND (SELECT `usage_limit` FROM `promotions` WHERE `id` = NEW.`promotion_id`)
		<= (SELECT count(*) FROM `orders` WHERE `promotion_id` = NEW.`promotion_id` AND `status` <> 'cancelled')
BEGIN
	SELECT RAISE(ABORT, 'promotion_usage_limit');
END;
--> statement-breakpoint
CREATE TRIGGER `orders_promotion_customer_limit` BEFORE INSERT ON `orders`
WHEN NEW.`promotion_id` IS NOT NULL
	AND NOT EXISTS (SELECT 1 FROM `orders` WHERE `idempotency_key` = NEW.`idempotency_key`)
	AND (SELECT `per_customer_limit` FROM `promotions` WHERE `id` = NEW.`promotion_id`) IS NOT NULL
	AND (NEW.`customer_phone` IS NULL
		OR (SELECT `per_customer_limit` FROM `promotions` WHERE `id` = NEW.`promotion_id`)
			<= (SELECT count(*) FROM `orders` o WHERE o.`promotion_id` = NEW.`promotion_id` AND o.`status` <> 'cancelled'
				AND (o.`customer_phone` = NEW.`customer_phone`
					OR o.`customer_id` = (SELECT `id` FROM `customers` WHERE `phone_e164` = NEW.`customer_phone`))))
BEGIN
	SELECT RAISE(ABORT, 'promotion_customer_limit');
END;
--> statement-breakpoint
CREATE TRIGGER `orders_promotion_discount_insert` BEFORE INSERT ON `orders`
WHEN NEW.`promotion_id` IS NOT NULL AND EXISTS (
	SELECT 1 FROM `promotions` p WHERE p.`id` = NEW.`promotion_id` AND (
		NEW.`discount_reason` IS NOT p.`code`
		OR (p.`min_subtotal` IS NOT NULL AND NEW.`subtotal` < p.`min_subtotal`)
		OR (p.`type` = 'percentage' AND NEW.`discount` IS NOT (NEW.`subtotal` * p.`value` + 50) / 100)
		OR (p.`type` = 'fixed' AND NEW.`discount` IS NOT min(p.`value`, NEW.`subtotal`))
	)
)
BEGIN
	SELECT RAISE(ABORT, 'promotion_discount_mismatch');
END;
--> statement-breakpoint

-- While the order is pending its lines may change: the discount follows the code's terms,
-- and an order that loses its code loses its discount. Confirmation fixes the discount
-- (the admin may change it there, with a reason).
CREATE TRIGGER `orders_promotion_discount_update` BEFORE UPDATE OF `subtotal`, `discount`, `discount_reason`, `promotion_id` ON `orders`
WHEN NEW.`status` = 'pending' AND (
	(NEW.`promotion_id` IS NOT NULL AND EXISTS (
		SELECT 1 FROM `promotions` p WHERE p.`id` = NEW.`promotion_id` AND (
			NEW.`discount_reason` IS NOT p.`code`
			OR (p.`min_subtotal` IS NOT NULL AND NEW.`subtotal` < p.`min_subtotal`)
			OR (p.`type` = 'percentage' AND NEW.`discount` IS NOT (NEW.`subtotal` * p.`value` + 50) / 100)
			OR (p.`type` = 'fixed' AND NEW.`discount` IS NOT min(p.`value`, NEW.`subtotal`))
		)
	))
	OR (NEW.`promotion_id` IS NULL AND OLD.`promotion_id` IS NOT NULL
		AND (NEW.`discount` <> 0 OR NEW.`discount_reason` IS NOT NULL))
)
BEGIN
	SELECT RAISE(ABORT, 'promotion_discount_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `orders_promotion_locked` BEFORE UPDATE OF `promotion_id` ON `orders`
WHEN NEW.`promotion_id` IS NOT OLD.`promotion_id`
	AND (NEW.`promotion_id` IS NOT NULL OR OLD.`status` <> 'pending')
BEGIN
	SELECT RAISE(ABORT, 'order_promotion_locked');
END;
--> statement-breakpoint

-- Backstop of the stock rule (src/server/domain/stock.ts). The rule needs the store's today
-- and the pending hold, which the database cannot know (it has no time zone), so the API
-- enforces it inside the batch that writes an order (stockFits in
-- src/server/domain/inventory.ts). This trigger keeps a weaker invariant that never refuses
-- what that guard accepts and stops a write path that forgets it: an order is confirmed only
-- while its lines, plus the units of the same sizes on other confirmed orders, fit in the
-- units of all their lots. The abort code is mapped in src/server/domain/db-errors.ts.
-- Written for the D1 statement splitter: uppercase block keywords, no conditional
-- expressions in trigger bodies, LF.
CREATE TRIGGER `orders_confirm_within_stock` BEFORE UPDATE OF `status` ON `orders`
WHEN OLD.`status` = 'pending' AND NEW.`status` = 'confirmed'
	AND EXISTS (SELECT 1 FROM `order_items` i WHERE i.`order_id` = NEW.`id`
		AND i.`quantity` + (SELECT coalesce(sum(c.`quantity`), 0) FROM `order_items` c
			JOIN `orders` o ON o.`id` = c.`order_id`
			WHERE c.`variant_id` = i.`variant_id` AND o.`status` = 'confirmed')
		> (SELECT coalesce(sum(m.`quantity`), 0) FROM `lots` l
			JOIN `inventory_movements` m ON m.`lot_id` = l.`id`
			WHERE l.`variant_id` = i.`variant_id`))
BEGIN
	SELECT RAISE(ABORT, 'order_exceeds_stock');
END;
--> statement-breakpoint
CREATE TRIGGER `variants_price_history_insert` AFTER INSERT ON `variants`
WHEN NEW.`price` IS NOT NULL
BEGIN
	INSERT INTO `price_history` (`variant_id`, `old_price`, `new_price`, `changed_by`) VALUES (NEW.`id`, NULL, NEW.`price`, NEW.`updated_by`);
END;
--> statement-breakpoint
CREATE TRIGGER `variants_price_history_update` AFTER UPDATE OF `price` ON `variants`
WHEN NEW.`price` IS NOT OLD.`price`
BEGIN
	INSERT INTO `price_history` (`variant_id`, `old_price`, `new_price`, `changed_by`) VALUES (NEW.`id`, OLD.`price`, NEW.`price`, NEW.`updated_by`);
END;
--> statement-breakpoint
CREATE TRIGGER `price_history_no_update` BEFORE UPDATE ON `price_history`
BEGIN
	SELECT RAISE(ABORT, 'price_history_append_only');
END;
--> statement-breakpoint
CREATE TRIGGER `price_history_no_delete` BEFORE DELETE ON `price_history`
BEGIN
	SELECT RAISE(ABORT, 'price_history_append_only');
END;
--> statement-breakpoint

CREATE TRIGGER `bundles_publish_requires_items_insert` BEFORE INSERT ON `bundles`
WHEN NEW.`status` = 'published'
BEGIN
	SELECT RAISE(ABORT, 'bundle_requires_two_items');
END;
--> statement-breakpoint
CREATE TRIGGER `bundles_published_two_items` BEFORE UPDATE OF `status`, `price` ON `bundles`
WHEN NEW.`status` = 'published'
	AND (SELECT count(*) FROM `bundle_items` WHERE `bundle_id` = NEW.`id`) < 2
BEGIN
	SELECT RAISE(ABORT, 'bundle_requires_two_items');
END;
--> statement-breakpoint
CREATE TRIGGER `bundles_published_items_available` BEFORE UPDATE OF `status`, `price` ON `bundles`
WHEN NEW.`status` = 'published'
	AND EXISTS (SELECT 1 FROM `bundle_items` i JOIN `variants` v ON v.`id` = i.`variant_id` JOIN `products` p ON p.`id` = v.`product_id`
		WHERE i.`bundle_id` = NEW.`id` AND (v.`status` <> 'active' OR v.`price` IS NULL OR p.`status` <> 'published'))
BEGIN
	SELECT RAISE(ABORT, 'bundle_item_unavailable');
END;
--> statement-breakpoint
CREATE TRIGGER `bundles_published_price_below_items` BEFORE UPDATE OF `status`, `price` ON `bundles`
WHEN NEW.`status` = 'published'
	AND NEW.`price` >= (SELECT coalesce(sum(i.`quantity` * v.`price`), 0) FROM `bundle_items` i JOIN `variants` v ON v.`id` = i.`variant_id` WHERE i.`bundle_id` = NEW.`id`)
BEGIN
	SELECT RAISE(ABORT, 'bundle_price_not_below_items');
END;
--> statement-breakpoint
CREATE TRIGGER `bundle_items_bundle_locked` BEFORE UPDATE OF `bundle_id` ON `bundle_items`
WHEN NEW.`bundle_id` IS NOT OLD.`bundle_id`
BEGIN
	SELECT RAISE(ABORT, 'bundle_items_bundle_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `bundle_items_published_insert_available` AFTER INSERT ON `bundle_items`
WHEN (SELECT `status` FROM `bundles` WHERE `id` = NEW.`bundle_id`) = 'published'
	AND EXISTS (SELECT 1 FROM `variants` v JOIN `products` p ON p.`id` = v.`product_id`
		WHERE v.`id` = NEW.`variant_id` AND (v.`status` <> 'active' OR v.`price` IS NULL OR p.`status` <> 'published'))
BEGIN
	SELECT RAISE(ABORT, 'bundle_item_unavailable');
END;
--> statement-breakpoint
CREATE TRIGGER `bundle_items_published_insert_price` AFTER INSERT ON `bundle_items`
WHEN (SELECT `status` FROM `bundles` WHERE `id` = NEW.`bundle_id`) = 'published'
	AND (SELECT `price` FROM `bundles` WHERE `id` = NEW.`bundle_id`)
		>= (SELECT coalesce(sum(i.`quantity` * v.`price`), 0) FROM `bundle_items` i JOIN `variants` v ON v.`id` = i.`variant_id` WHERE i.`bundle_id` = NEW.`bundle_id`)
BEGIN
	SELECT RAISE(ABORT, 'bundle_price_not_below_items');
END;
--> statement-breakpoint
CREATE TRIGGER `bundle_items_published_update_available` AFTER UPDATE ON `bundle_items`
WHEN (SELECT `status` FROM `bundles` WHERE `id` = NEW.`bundle_id`) = 'published'
	AND EXISTS (SELECT 1 FROM `variants` v JOIN `products` p ON p.`id` = v.`product_id`
		WHERE v.`id` = NEW.`variant_id` AND (v.`status` <> 'active' OR v.`price` IS NULL OR p.`status` <> 'published'))
BEGIN
	SELECT RAISE(ABORT, 'bundle_item_unavailable');
END;
--> statement-breakpoint
CREATE TRIGGER `bundle_items_published_update_price` AFTER UPDATE ON `bundle_items`
WHEN (SELECT `status` FROM `bundles` WHERE `id` = NEW.`bundle_id`) = 'published'
	AND (SELECT `price` FROM `bundles` WHERE `id` = NEW.`bundle_id`)
		>= (SELECT coalesce(sum(i.`quantity` * v.`price`), 0) FROM `bundle_items` i JOIN `variants` v ON v.`id` = i.`variant_id` WHERE i.`bundle_id` = NEW.`bundle_id`)
BEGIN
	SELECT RAISE(ABORT, 'bundle_price_not_below_items');
END;
--> statement-breakpoint
CREATE TRIGGER `bundle_items_published_delete_two_items` AFTER DELETE ON `bundle_items`
WHEN (SELECT `status` FROM `bundles` WHERE `id` = OLD.`bundle_id`) = 'published'
	AND (SELECT count(*) FROM `bundle_items` WHERE `bundle_id` = OLD.`bundle_id`) < 2
BEGIN
	SELECT RAISE(ABORT, 'bundle_requires_two_items');
END;
--> statement-breakpoint
CREATE TRIGGER `bundle_items_published_delete_price` AFTER DELETE ON `bundle_items`
WHEN (SELECT `status` FROM `bundles` WHERE `id` = OLD.`bundle_id`) = 'published'
	AND (SELECT `price` FROM `bundles` WHERE `id` = OLD.`bundle_id`)
		>= (SELECT coalesce(sum(i.`quantity` * v.`price`), 0) FROM `bundle_items` i JOIN `variants` v ON v.`id` = i.`variant_id` WHERE i.`bundle_id` = OLD.`bundle_id`)
BEGIN
	SELECT RAISE(ABORT, 'bundle_price_not_below_items');
END;
--> statement-breakpoint
CREATE TRIGGER `variants_bundle_price_below_items` BEFORE UPDATE OF `price` ON `variants`
WHEN NEW.`price` IS NOT NULL AND EXISTS (
	SELECT 1 FROM `bundle_items` bi JOIN `bundles` b ON b.`id` = bi.`bundle_id`
	WHERE bi.`variant_id` = NEW.`id` AND b.`status` = 'published'
		AND b.`price` >= bi.`quantity` * NEW.`price`
			+ (SELECT coalesce(sum(i.`quantity` * v.`price`), 0) FROM `bundle_items` i JOIN `variants` v ON v.`id` = i.`variant_id` WHERE i.`bundle_id` = b.`id` AND i.`variant_id` <> NEW.`id`)
)
BEGIN
	SELECT RAISE(ABORT, 'bundle_price_not_below_items');
END;
--> statement-breakpoint
CREATE TRIGGER `variants_bundle_item_available` BEFORE UPDATE OF `price`, `status` ON `variants`
WHEN (NEW.`price` IS NULL OR NEW.`status` <> 'active')
	AND EXISTS (SELECT 1 FROM `bundle_items` bi JOIN `bundles` b ON b.`id` = bi.`bundle_id` WHERE bi.`variant_id` = NEW.`id` AND b.`status` = 'published')
BEGIN
	SELECT RAISE(ABORT, 'bundle_item_unavailable');
END;
--> statement-breakpoint
CREATE TRIGGER `products_bundle_item_available` BEFORE UPDATE OF `status` ON `products`
WHEN NEW.`status` <> 'published'
	AND EXISTS (SELECT 1 FROM `variants` v JOIN `bundle_items` bi ON bi.`variant_id` = v.`id` JOIN `bundles` b ON b.`id` = bi.`bundle_id`
		WHERE v.`product_id` = NEW.`id` AND b.`status` = 'published')
BEGIN
	SELECT RAISE(ABORT, 'bundle_item_unavailable');
END;
--> statement-breakpoint

CREATE TRIGGER `users_email_normalized_insert` BEFORE INSERT ON `users`
WHEN NEW.`email` IS NOT lower(trim(NEW.`email`))
BEGIN
	SELECT RAISE(ABORT, 'email_not_normalized');
END;
--> statement-breakpoint
CREATE TRIGGER `users_email_normalized_update` BEFORE UPDATE OF `email` ON `users`
WHEN NEW.`email` IS NOT lower(trim(NEW.`email`))
BEGIN
	SELECT RAISE(ABORT, 'email_not_normalized');
END;
--> statement-breakpoint
CREATE TRIGGER `users_role_known_insert` BEFORE INSERT ON `users`
WHEN NEW.`role` IS NULL OR NEW.`role` NOT IN ('customer', 'support', 'admin')
BEGIN
	SELECT RAISE(ABORT, 'unknown_role');
END;
--> statement-breakpoint
CREATE TRIGGER `users_role_known_update` BEFORE UPDATE OF `role` ON `users`
WHEN NEW.`role` IS NULL OR NEW.`role` NOT IN ('customer', 'support', 'admin')
BEGIN
	SELECT RAISE(ABORT, 'unknown_role');
END;
--> statement-breakpoint
CREATE TRIGGER `customers_account_is_customer_insert` BEFORE INSERT ON `customers`
WHEN NEW.`auth_user_id` IS NOT NULL
	AND (SELECT `role` FROM `users` WHERE `id` = NEW.`auth_user_id`) IS NOT 'customer'
BEGIN
	SELECT RAISE(ABORT, 'customer_account_not_customer');
END;
--> statement-breakpoint
CREATE TRIGGER `customers_account_locked` BEFORE UPDATE OF `auth_user_id` ON `customers`
WHEN NEW.`auth_user_id` IS NOT OLD.`auth_user_id`
	AND (OLD.`auth_user_id` IS NOT NULL
		OR (SELECT `role` FROM `users` WHERE `id` = NEW.`auth_user_id`) IS NOT 'customer')
BEGIN
	SELECT RAISE(ABORT, 'customer_account_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `customers_no_delete` BEFORE DELETE ON `customers`
BEGIN
	SELECT RAISE(ABORT, 'customers_are_permanent');
END;
--> statement-breakpoint
CREATE TRIGGER `customer_addresses_owner_locked` BEFORE UPDATE OF `customer_id` ON `customer_addresses`
WHEN NEW.`customer_id` IS NOT OLD.`customer_id`
BEGIN
	SELECT RAISE(ABORT, 'customer_addresses_owner_locked');
END;
--> statement-breakpoint
CREATE TRIGGER `customer_addresses_no_delete` BEFORE DELETE ON `customer_addresses`
BEGIN
	SELECT RAISE(ABORT, 'customer_addresses_are_archived');
END;
--> statement-breakpoint

CREATE TRIGGER `orders_status_history_insert` AFTER INSERT ON `orders`
BEGIN
	INSERT INTO `order_status_history` (`order_id`, `from_status`, `to_status`) VALUES (NEW.`id`, NULL, NEW.`status`);
END;
--> statement-breakpoint
CREATE TRIGGER `orders_status_history_update` AFTER UPDATE OF `status` ON `orders`
WHEN NEW.`status` IS NOT OLD.`status`
BEGIN
	INSERT INTO `order_status_history` (`order_id`, `from_status`, `to_status`) VALUES (NEW.`id`, OLD.`status`, NEW.`status`);
END;
--> statement-breakpoint
CREATE TRIGGER `order_status_history_no_update` BEFORE UPDATE ON `order_status_history`
BEGIN
	SELECT RAISE(ABORT, 'order_status_history_append_only');
END;
--> statement-breakpoint
CREATE TRIGGER `order_status_history_no_delete` BEFORE DELETE ON `order_status_history`
BEGIN
	SELECT RAISE(ABORT, 'order_status_history_append_only');
END;
--> statement-breakpoint

CREATE TRIGGER `shipping_zone_municipalities_not_rest_insert` BEFORE INSERT ON `shipping_zone_municipalities`
WHEN (SELECT `covers_rest` FROM `shipping_zones` WHERE `id` = NEW.`zone_id`) = 1
BEGIN
	SELECT RAISE(ABORT, 'zone_covers_rest');
END;
--> statement-breakpoint
CREATE TRIGGER `shipping_zone_municipalities_not_rest_update` BEFORE UPDATE OF `zone_id` ON `shipping_zone_municipalities`
WHEN (SELECT `covers_rest` FROM `shipping_zones` WHERE `id` = NEW.`zone_id`) = 1
BEGIN
	SELECT RAISE(ABORT, 'zone_covers_rest');
END;
--> statement-breakpoint
CREATE TRIGGER `shipping_zones_rest_has_no_municipalities` BEFORE UPDATE OF `covers_rest` ON `shipping_zones`
WHEN NEW.`covers_rest` = 1
	AND EXISTS (SELECT 1 FROM `shipping_zone_municipalities` WHERE `zone_id` = NEW.`id`)
BEGIN
	SELECT RAISE(ABORT, 'zone_covers_rest');
END;
--> statement-breakpoint

CREATE VIEW `customer_segments` AS
SELECT c.`id` AS `customer_id`,
	count(o.`id`) AS `order_count`,
	max(o.`created_at`) AS `last_order_at`,
	iif(s.`inactive_customer_days` IS NULL OR s.`frequent_customer_min_orders` IS NULL, NULL,
		iif(count(o.`id`) = 0, 'new',
			iif(julianday('now') - julianday(max(o.`created_at`)) > s.`inactive_customer_days`, 'inactive',
				iif(count(o.`id`) >= s.`frequent_customer_min_orders`, 'frequent', 'occasional')))) AS `segment`
FROM `customers` c
JOIN `store_settings` s ON s.`id` = 1
LEFT JOIN `orders` o ON o.`customer_id` = c.`id` AND o.`status` IN ('confirmed', 'fulfilled', 'delivered')
GROUP BY c.`id`;
--> statement-breakpoint

CREATE VIEW `order_followups` AS
SELECT o.`id` AS `order_id`,
	o.`status` AS `status`,
	o.`since` AS `since`,
	o.`deadline_hours` AS `deadline_hours`,
	strftime('%Y-%m-%dT%H:%M:%SZ', julianday(o.`since`) + o.`deadline_hours` / 24.0) AS `due_at`,
	round((julianday('now') - julianday(o.`since`)) * 24 - o.`deadline_hours`, 1) AS `hours_overdue`
FROM (
	SELECT x.`id`, x.`status`, x.`created_at` AS `since`, s.`followup_pending_payment_hours` AS `deadline_hours`
	FROM `orders` x JOIN `store_settings` s ON s.`id` = 1 WHERE x.`status` = 'pending'
	UNION ALL
	SELECT x.`id`, x.`status`, x.`confirmed_at`, s.`followup_paid_unshipped_hours`
	FROM `orders` x JOIN `store_settings` s ON s.`id` = 1 WHERE x.`status` = 'confirmed'
	UNION ALL
	SELECT x.`id`, x.`status`, x.`fulfilled_at`, s.`followup_shipped_undelivered_hours`
	FROM `orders` x JOIN `store_settings` s ON s.`id` = 1 WHERE x.`status` = 'fulfilled'
) o
WHERE o.`deadline_hours` IS NOT NULL
	AND julianday('now') > julianday(o.`since`) + o.`deadline_hours` / 24.0;
