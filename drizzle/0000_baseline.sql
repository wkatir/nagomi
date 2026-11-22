CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`data` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_events_entity_idx` ON `audit_events` (`entity_type`,`entity_id`,`id`);--> statement-breakpoint
CREATE INDEX `audit_events_created_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_actor_idx` ON `audit_events` (`actor_user_id`,`id`);--> statement-breakpoint
CREATE TABLE `brand_translations` (
	`brand_id` integer NOT NULL,
	`locale` text NOT NULL,
	`description` text,
	`seo_title` text,
	`seo_description` text,
	PRIMARY KEY(`brand_id`, `locale`),
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `brands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`search_key` text NOT NULL,
	`country_code` text(2),
	`status` text DEFAULT 'active' NOT NULL,
	CONSTRAINT "brands_slug" CHECK("brands"."slug" not glob '*[^a-z0-9-]*' and "brands"."slug" not glob '-*' and "brands"."slug" not glob '*-' and "brands"."slug" not glob '*--*' and length("brands"."slug") between 1 and 80),
	CONSTRAINT "brands_status" CHECK("brands"."status" in ('active', 'archived')),
	CONSTRAINT "brands_country" CHECK("brands"."country_code" is null or length("brands"."country_code") = 2)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `brands_slug_unique` ON `brands` (`slug`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`routine_step` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	CONSTRAINT "categories_slug" CHECK("categories"."slug" not glob '*[^a-z0-9-]*' and "categories"."slug" not glob '-*' and "categories"."slug" not glob '*-' and "categories"."slug" not glob '*--*' and length("categories"."slug") between 1 and 80),
	CONSTRAINT "categories_status" CHECK("categories"."status" in ('active', 'archived')),
	CONSTRAINT "categories_routine_step" CHECK("categories"."routine_step" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `category_translations` (
	`category_id` integer NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`seo_title` text,
	`seo_description` text,
	PRIMARY KEY(`category_id`, `locale`),
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `concern_translations` (
	`concern_id` integer NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`seo_title` text,
	`seo_description` text,
	PRIMARY KEY(`concern_id`, `locale`),
	FOREIGN KEY (`concern_id`) REFERENCES `concerns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `concerns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	CONSTRAINT "concerns_slug" CHECK("concerns"."slug" not glob '*[^a-z0-9-]*' and "concerns"."slug" not glob '-*' and "concerns"."slug" not glob '*-' and "concerns"."slug" not glob '*--*' and length("concerns"."slug") between 1 and 80),
	CONSTRAINT "concerns_status" CHECK("concerns"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `concerns_slug_unique` ON `concerns` (`slug`);--> statement-breakpoint
CREATE TABLE `media_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`r2_key` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`created_by` text,
	CONSTRAINT "media_files_content_type" CHECK("media_files"."content_type" in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
	CONSTRAINT "media_files_size" CHECK("media_files"."byte_size" > 0 and "media_files"."width" > 0 and "media_files"."height" > 0),
	CONSTRAINT "media_files_key" CHECK(length("media_files"."r2_key") between 68 and 69 and substr("media_files"."r2_key", 1, 64) not glob '*[^0-9a-f]*' and substr("media_files"."r2_key", 65) in ('.jpg', '.png', '.webp', '.avif'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_files_r2_key_unique` ON `media_files` (`r2_key`);--> statement-breakpoint
CREATE TABLE `product_concerns` (
	`product_id` integer NOT NULL,
	`concern_id` integer NOT NULL,
	PRIMARY KEY(`product_id`, `concern_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`concern_id`) REFERENCES `concerns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `product_concerns_concern_idx` ON `product_concerns` (`concern_id`);--> statement-breakpoint
CREATE TABLE `product_image_translations` (
	`image_id` integer NOT NULL,
	`locale` text NOT NULL,
	`alt` text NOT NULL,
	PRIMARY KEY(`image_id`, `locale`),
	FOREIGN KEY (`image_id`) REFERENCES `product_images`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`variant_id` integer,
	`media_file_id` integer NOT NULL,
	`kind` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_file_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "product_images_kind" CHECK("product_images"."kind" in ('packshot', 'lifestyle', 'texture')),
	CONSTRAINT "product_images_status" CHECK("product_images"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE INDEX `product_images_product_idx` ON `product_images` (`product_id`,`status`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_images_product_file` ON `product_images` (`product_id`,`media_file_id`) WHERE status = 'active';--> statement-breakpoint
CREATE TABLE `product_skin_types` (
	`product_id` integer NOT NULL,
	`skin_type` text NOT NULL,
	PRIMARY KEY(`product_id`, `skin_type`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "product_skin_types_skin_type" CHECK("product_skin_types"."skin_type" in ('normal', 'dry', 'oily', 'combination', 'sensitive'))
);
--> statement-breakpoint
CREATE TABLE `product_translations` (
	`product_id` integer NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`search_key` text NOT NULL,
	`tagline` text,
	`description` text,
	`how_to_use` text,
	`key_ingredients` text,
	`benefits` text,
	`cautions` text,
	`seo_title` text,
	`seo_description` text,
	PRIMARY KEY(`product_id`, `locale`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`brand_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`inci` text,
	`sanitary_registration` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "products_status" CHECK("products"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "products_slug" CHECK("products"."slug" not glob '*[^a-z0-9-]*' and "products"."slug" not glob '-*' and "products"."slug" not glob '*-' and "products"."slug" not glob '*--*' and length("products"."slug") between 1 and 80)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `products_brand_idx` ON `products` (`brand_id`);--> statement-breakpoint
CREATE INDEX `products_category_idx` ON `products` (`category_id`);--> statement-breakpoint
CREATE INDEX `products_status_idx` ON `products` (`status`);--> statement-breakpoint
CREATE TABLE `variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`sku` text NOT NULL,
	`search_key` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`size_value` integer,
	`size_unit` text,
	`price` integer,
	`compare_at_price` integer,
	`reorder_point` integer,
	`gtin` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "variants_status" CHECK("variants"."status" in ('active', 'archived')),
	CONSTRAINT "variants_size_unit" CHECK("variants"."size_unit" in ('ml', 'g', 'units')),
	CONSTRAINT "variants_price_positive" CHECK("variants"."price" is null or "variants"."price" > 0),
	CONSTRAINT "variants_compare_at_gt_price" CHECK("variants"."compare_at_price" is null or ("variants"."price" is not null and "variants"."compare_at_price" > "variants"."price")),
	CONSTRAINT "variants_size_pair" CHECK(("variants"."size_value" is null) = ("variants"."size_unit" is null) and ("variants"."size_value" is null or "variants"."size_value" > 0)),
	CONSTRAINT "variants_reorder_point" CHECK("variants"."reorder_point" is null or "variants"."reorder_point" >= 0),
	CONSTRAINT "variants_gtin" CHECK("variants"."gtin" is null or (length("variants"."gtin") = 14 and "variants"."gtin" not glob '*[^0-9]*'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `variants_sku_unique` ON `variants` (`sku`);--> statement-breakpoint
CREATE INDEX `variants_product_idx` ON `variants` (`product_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `variants_gtin_unique` ON `variants` (`gtin`) WHERE gtin is not null;--> statement-breakpoint
CREATE TABLE `customer_consents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer,
	`order_id` integer,
	`purpose` text NOT NULL,
	`granted` integer NOT NULL,
	`page_version_id` integer NOT NULL,
	`channel` text NOT NULL,
	`recorded_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`recorded_by` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`page_version_id`) REFERENCES `page_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "customer_consents_purpose" CHECK("customer_consents"."purpose" in ('privacy_notice', 'terms', 'marketing_whatsapp')),
	CONSTRAINT "customer_consents_channel" CHECK("customer_consents"."channel" in ('web', 'whatsapp', 'instagram', 'in_person')),
	CONSTRAINT "customer_consents_owner" CHECK("customer_consents"."customer_id" is not null or "customer_consents"."order_id" is not null)
);
--> statement-breakpoint
CREATE INDEX `customer_consents_customer_idx` ON `customer_consents` (`customer_id`,`purpose`,`id`);--> statement-breakpoint
CREATE INDEX `customer_consents_order_idx` ON `customer_consents` (`order_id`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`phone_e164` text,
	`email` text,
	`search_key` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	CONSTRAINT "customers_phone_e164" CHECK("customers"."phone_e164" is null or ("customers"."phone_e164" glob '+[1-9][0-9]*' and length("customers"."phone_e164") between 8 and 16))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_phone_e164_unique` ON `customers` (`phone_e164`);--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_id` integer NOT NULL,
	`kind` text NOT NULL,
	`quantity` integer NOT NULL,
	`order_item_id` integer,
	`return_line_id` integer,
	`reason` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`return_line_id`) REFERENCES `return_lines`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "inventory_movements_kind" CHECK("inventory_movements"."kind" in ('receive', 'sale', 'return', 'adjustment', 'waste')),
	CONSTRAINT "inventory_movements_reason" CHECK("inventory_movements"."reason" in ('expired', 'damaged', 'sample_tester', 'own_use', 'lost_theft', 'count_difference', 'customer_return', 'other')),
	CONSTRAINT "inventory_movements_nonzero" CHECK("inventory_movements"."quantity" <> 0),
	CONSTRAINT "inventory_movements_sign" CHECK(("inventory_movements"."kind" in ('receive', 'return') and "inventory_movements"."quantity" > 0) or ("inventory_movements"."kind" in ('sale', 'waste') and "inventory_movements"."quantity" < 0) or "inventory_movements"."kind" = 'adjustment'),
	CONSTRAINT "inventory_movements_links" CHECK(("inventory_movements"."kind" = 'sale') = ("inventory_movements"."order_item_id" is not null) and ("inventory_movements"."kind" = 'return' or ("inventory_movements"."kind" = 'waste' and "inventory_movements"."reason" = 'customer_return')) = ("inventory_movements"."return_line_id" is not null)),
	CONSTRAINT "inventory_movements_reason_required" CHECK("inventory_movements"."kind" not in ('waste', 'adjustment') or "inventory_movements"."reason" is not null)
);
--> statement-breakpoint
CREATE INDEX `inventory_movements_lot_idx` ON `inventory_movements` (`lot_id`);--> statement-breakpoint
CREATE INDEX `inventory_movements_order_item_idx` ON `inventory_movements` (`order_item_id`);--> statement-breakpoint
CREATE INDEX `inventory_movements_return_line_idx` ON `inventory_movements` (`return_line_id`);--> statement-breakpoint
CREATE INDEX `inventory_movements_created_idx` ON `inventory_movements` (`created_at`);--> statement-breakpoint
CREATE TABLE `lots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`variant_id` integer NOT NULL,
	`receipt_line_id` integer NOT NULL,
	`code` text,
	`expires_on` text NOT NULL,
	`expiry_precision` text DEFAULT 'day' NOT NULL,
	`unit_cost_e4` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receipt_line_id`) REFERENCES `purchase_receipt_lines`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "lots_expiry_precision" CHECK("lots"."expiry_precision" in ('day', 'month')),
	CONSTRAINT "lots_expires_on" CHECK("lots"."expires_on" glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "lots_month_precision" CHECK("lots"."expiry_precision" = 'day' or "lots"."expires_on" = date("lots"."expires_on", 'start of month', '+1 month', '-1 day')),
	CONSTRAINT "lots_unit_cost" CHECK("lots"."unit_cost_e4" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lots_receipt_line_unique` ON `lots` (`receipt_line_id`);--> statement-breakpoint
CREATE INDEX `lots_variant_expiry_idx` ON `lots` (`variant_id`,`expires_on`);--> statement-breakpoint
CREATE TABLE `collection_products` (
	`collection_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`collection_id`, `product_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "collection_products_position_positive" CHECK("collection_products"."position" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_products_position` ON `collection_products` (`collection_id`,`position`);--> statement-breakpoint
CREATE INDEX `collection_products_product_idx` ON `collection_products` (`product_id`);--> statement-breakpoint
CREATE TABLE `collection_translations` (
	`collection_id` integer NOT NULL,
	`locale` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`cover_alt` text,
	`seo_title` text,
	`seo_description` text,
	PRIMARY KEY(`collection_id`, `locale`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`show_on_home` integer DEFAULT false NOT NULL,
	`cover_media_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	FOREIGN KEY (`cover_media_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "collections_slug" CHECK("collections"."slug" not glob '*[^a-z0-9-]*' and "collections"."slug" not glob '-*' and "collections"."slug" not glob '*-' and "collections"."slug" not glob '*--*' and length("collections"."slug") between 1 and 80),
	CONSTRAINT "collections_status" CHECK("collections"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "collections_position" CHECK("collections"."position" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collections_slug_unique` ON `collections` (`slug`);--> statement-breakpoint
CREATE INDEX `collections_status_idx` ON `collections` (`status`,`position`);--> statement-breakpoint
CREATE TABLE `home_slide_translations` (
	`slide_id` integer NOT NULL,
	`locale` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`cta_label` text,
	`image_alt` text NOT NULL,
	PRIMARY KEY(`slide_id`, `locale`),
	FOREIGN KEY (`slide_id`) REFERENCES `home_slides`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `home_slides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`desktop_media_id` integer NOT NULL,
	`mobile_media_id` integer,
	`link_path` text NOT NULL,
	`starts_on` text,
	`ends_on` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	FOREIGN KEY (`desktop_media_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mobile_media_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "home_slides_status" CHECK("home_slides"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "home_slides_position" CHECK("home_slides"."position" >= 0),
	CONSTRAINT "home_slides_link_path" CHECK("home_slides"."link_path" glob '/*' and "home_slides"."link_path" not glob '//*' and "home_slides"."link_path" not glob '*[^!-~]*' and "home_slides"."link_path" not glob '*\*' and length("home_slides"."link_path") <= 300),
	CONSTRAINT "home_slides_dates" CHECK(("home_slides"."starts_on" is null or "home_slides"."starts_on" glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]') and ("home_slides"."ends_on" is null or "home_slides"."ends_on" glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]') and ("home_slides"."starts_on" is null or "home_slides"."ends_on" is null or "home_slides"."starts_on" <= "home_slides"."ends_on"))
);
--> statement-breakpoint
CREATE INDEX `home_slides_status_idx` ON `home_slides` (`status`,`position`);--> statement-breakpoint
CREATE TABLE `routine_items` (
	`routine_id` integer NOT NULL,
	`variant_id` integer NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`routine_id`, `variant_id`),
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routine_items_position` ON `routine_items` (`routine_id`,`position`);--> statement-breakpoint
CREATE INDEX `routine_items_variant_idx` ON `routine_items` (`variant_id`);--> statement-breakpoint
CREATE TABLE `routine_translations` (
	`routine_id` integer NOT NULL,
	`locale` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`seo_title` text,
	`seo_description` text,
	PRIMARY KEY(`routine_id`, `locale`),
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `routines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`concern_id` integer,
	FOREIGN KEY (`concern_id`) REFERENCES `concerns`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "routines_slug" CHECK("routines"."slug" not glob '*[^a-z0-9-]*' and "routines"."slug" not glob '-*' and "routines"."slug" not glob '*-' and "routines"."slug" not glob '*--*' and length("routines"."slug") between 1 and 80),
	CONSTRAINT "routines_status" CHECK("routines"."status" in ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routines_slug_unique` ON `routines` (`slug`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`variant_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`sku` text NOT NULL,
	`brand_name` text NOT NULL,
	`product_name` text NOT NULL,
	`size_value` integer,
	`size_unit` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_items_size_unit" CHECK("order_items"."size_unit" in ('ml', 'g', 'units')),
	CONSTRAINT "order_items_quantity_positive" CHECK("order_items"."quantity" > 0),
	CONSTRAINT "order_items_unit_price" CHECK("order_items"."unit_price" >= 0),
	CONSTRAINT "order_items_size_pair" CHECK(("order_items"."size_value" is null) = ("order_items"."size_unit" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_items_unique` ON `order_items` (`order_id`,`variant_id`);--> statement-breakpoint
CREATE INDEX `order_items_variant_idx` ON `order_items` (`variant_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`customer_id` integer,
	`customer_name` text,
	`search_key` text NOT NULL,
	`locale` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payment_method` text,
	`subtotal` integer NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`discount_reason` text,
	`shipping` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`shipping_method` text,
	`shipping_zone_id` integer,
	`shipping_zone_name` text,
	`ship_to` text,
	`delivery_estimate_from` text,
	`delivery_estimate_to` text,
	`confirmation_message` text,
	`cancel_reason` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`confirmed_at` text,
	`fulfilled_at` text,
	`delivered_at` text,
	`cancelled_at` text,
	`promotion_id` integer,
	`customer_phone` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shipping_zone_id`) REFERENCES `shipping_zones`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`promotion_id`) REFERENCES `promotions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "orders_channel" CHECK("orders"."channel" in ('whatsapp', 'instagram', 'in_person')),
	CONSTRAINT "orders_status" CHECK("orders"."status" in ('pending', 'confirmed', 'fulfilled', 'delivered', 'cancelled')),
	CONSTRAINT "orders_payment_method" CHECK("orders"."payment_method" in ('bank_transfer', 'cash_on_delivery', 'payment_link', 'cash')),
	CONSTRAINT "orders_customer_phone" CHECK("orders"."customer_phone" is null or ("orders"."customer_phone" glob '+[1-9]*' and substr("orders"."customer_phone", 2) not glob '*[^0-9]*' and length("orders"."customer_phone") between 8 and 16)),
	CONSTRAINT "orders_shipping_method" CHECK("orders"."shipping_method" in ('pickup', 'own_delivery', 'courier')),
	CONSTRAINT "orders_total_consistent" CHECK("orders"."total" = "orders"."subtotal" - "orders"."discount" + "orders"."shipping"),
	CONSTRAINT "orders_amounts_non_negative" CHECK("orders"."subtotal" >= 0 and "orders"."discount" >= 0 and "orders"."discount" <= "orders"."subtotal" and "orders"."shipping" >= 0),
	CONSTRAINT "orders_discount_reason" CHECK("orders"."discount" = 0 or "orders"."discount_reason" is not null),
	CONSTRAINT "orders_delivery_estimate" CHECK(("orders"."delivery_estimate_from" is null) = ("orders"."delivery_estimate_to" is null) and ("orders"."delivery_estimate_from" is null or ("orders"."delivery_estimate_from" glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' and "orders"."delivery_estimate_to" glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' and "orders"."delivery_estimate_from" <= "orders"."delivery_estimate_to")))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_code_unique` ON `orders` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_idempotency_key_unique` ON `orders` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `orders_status_created_idx` ON `orders` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_customer_created_idx` ON `orders` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_created_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `orders_fulfilled_idx` ON `orders` (`fulfilled_at`);--> statement-breakpoint
CREATE INDEX `orders_confirmed_idx` ON `orders` (`confirmed_at`);--> statement-breakpoint
CREATE INDEX `orders_promotion_idx` ON `orders` (`promotion_id`);--> statement-breakpoint
CREATE INDEX `orders_customer_phone_idx` ON `orders` (`customer_phone`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`kind` text NOT NULL,
	`method` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text NOT NULL,
	`reference` text,
	`provider_transaction_id` text,
	`return_id` integer,
	`recorded_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`recorded_by` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`return_id`) REFERENCES `returns`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payments_kind" CHECK("payments"."kind" in ('payment', 'refund')),
	CONSTRAINT "payments_method" CHECK("payments"."method" in ('bank_transfer', 'cash_on_delivery', 'payment_link', 'cash')),
	CONSTRAINT "payments_status" CHECK("payments"."status" in ('pending', 'confirmed', 'failed')),
	CONSTRAINT "payments_amount_positive" CHECK("payments"."amount" > 0),
	CONSTRAINT "payments_return_is_refund" CHECK("payments"."return_id" is null or "payments"."kind" = 'refund')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_provider_transaction_id_unique` ON `payments` (`provider_transaction_id`);--> statement-breakpoint
CREATE INDEX `payments_order_idx` ON `payments` (`order_id`);--> statement-breakpoint
CREATE INDEX `payments_kind_recorded_idx` ON `payments` (`kind`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `return_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`return_id` integer NOT NULL,
	`order_item_id` integer NOT NULL,
	`lot_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`disposition` text NOT NULL,
	FOREIGN KEY (`return_id`) REFERENCES `returns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "return_lines_disposition" CHECK("return_lines"."disposition" in ('restock', 'write_off')),
	CONSTRAINT "return_lines_quantity" CHECK("return_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `return_lines_return_idx` ON `return_lines` (`return_id`);--> statement-breakpoint
CREATE INDEX `return_lines_order_item_idx` ON `return_lines` (`order_item_id`,`lot_id`);--> statement-breakpoint
CREATE TABLE `returns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "returns_reason" CHECK("returns"."reason" in ('withdrawal', 'defective', 'wrong_item', 'delivery_failed', 'other'))
);
--> statement-breakpoint
CREATE INDEX `returns_order_idx` ON `returns` (`order_id`);--> statement-breakpoint
CREATE INDEX `returns_created_idx` ON `returns` (`created_at`);--> statement-breakpoint
CREATE TABLE `promotion_translations` (
	`promotion_id` integer NOT NULL,
	`locale` text NOT NULL,
	`description` text NOT NULL,
	PRIMARY KEY(`promotion_id`, `locale`),
	FOREIGN KEY (`promotion_id`) REFERENCES `promotions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `promotions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`type` text NOT NULL,
	`value` integer NOT NULL,
	`min_subtotal` integer,
	`starts_on` text,
	`ends_on` text,
	`usage_limit` integer,
	`per_customer_limit` integer,
	`status` text DEFAULT 'inactive' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	CONSTRAINT "promotions_type" CHECK("promotions"."type" in ('percentage', 'fixed')),
	CONSTRAINT "promotions_status" CHECK("promotions"."status" in ('active', 'inactive', 'archived')),
	CONSTRAINT "promotions_code" CHECK(length("promotions"."code") between 3 and 32 and "promotions"."code" not glob '*[^A-Z0-9_-]*'),
	CONSTRAINT "promotions_value" CHECK(("promotions"."type" = 'percentage' and "promotions"."value" between 1 and 100) or ("promotions"."type" = 'fixed' and "promotions"."value" > 0)),
	CONSTRAINT "promotions_limits" CHECK(("promotions"."min_subtotal" is null or "promotions"."min_subtotal" > 0) and ("promotions"."usage_limit" is null or "promotions"."usage_limit" > 0) and ("promotions"."per_customer_limit" is null or "promotions"."per_customer_limit" > 0)),
	CONSTRAINT "promotions_dates" CHECK(("promotions"."starts_on" is null or "promotions"."starts_on" glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]') and ("promotions"."ends_on" is null or "promotions"."ends_on" glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]') and ("promotions"."starts_on" is null or "promotions"."ends_on" is null or "promotions"."starts_on" <= "promotions"."ends_on"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promotions_code_unique` ON `promotions` (`code`);--> statement-breakpoint
CREATE TABLE `purchase_order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_order_id` integer NOT NULL,
	`variant_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cost` integer NOT NULL,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "purchase_order_items_quantity_positive" CHECK("purchase_order_items"."quantity" > 0),
	CONSTRAINT "purchase_order_items_cost_non_negative" CHECK("purchase_order_items"."unit_cost" >= 0)
);
--> statement-breakpoint
CREATE INDEX `purchase_order_items_po_idx` ON `purchase_order_items` (`purchase_order_id`);--> statement-breakpoint
CREATE INDEX `purchase_order_items_variant_idx` ON `purchase_order_items` (`variant_id`);--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`supplier_id` integer NOT NULL,
	`reference` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`tax_included` integer,
	`notes` text,
	`ordered_on` text,
	`cancelled_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "purchase_orders_status" CHECK("purchase_orders"."status" in ('draft', 'ordered', 'partially_received', 'received', 'cancelled')),
	CONSTRAINT "purchase_orders_ordered_on" CHECK("purchase_orders"."ordered_on" is null or "purchase_orders"."ordered_on" glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "purchase_orders_ordered" CHECK("purchase_orders"."status" in ('draft', 'cancelled') or "purchase_orders"."ordered_on" is not null),
	CONSTRAINT "purchase_orders_notes" CHECK("purchase_orders"."notes" is null or trim("purchase_orders"."notes") <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_orders_supplier_reference` ON `purchase_orders` (`supplier_id`,`reference`) WHERE status <> 'cancelled';--> statement-breakpoint
CREATE INDEX `purchase_orders_status_idx` ON `purchase_orders` (`status`);--> statement-breakpoint
CREATE TABLE `purchase_receipt_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`receipt_id` integer NOT NULL,
	`purchase_order_item_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`allocated_shipping_e4` integer NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `purchase_receipts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_order_item_id`) REFERENCES `purchase_order_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "purchase_receipt_lines_quantity" CHECK("purchase_receipt_lines"."quantity" > 0),
	CONSTRAINT "purchase_receipt_lines_shipping" CHECK("purchase_receipt_lines"."allocated_shipping_e4" >= 0)
);
--> statement-breakpoint
CREATE INDEX `purchase_receipt_lines_receipt_idx` ON `purchase_receipt_lines` (`receipt_id`);--> statement-breakpoint
CREATE INDEX `purchase_receipt_lines_item_idx` ON `purchase_receipt_lines` (`purchase_order_item_id`);--> statement-breakpoint
CREATE TABLE `purchase_receipts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_order_id` integer NOT NULL,
	`received_on` text NOT NULL,
	`supplier_invoice_ref` text,
	`shipping_cost` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "purchase_receipts_received_on" CHECK("purchase_receipts"."received_on" glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "purchase_receipts_shipping" CHECK("purchase_receipts"."shipping_cost" >= 0)
);
--> statement-breakpoint
CREATE INDEX `purchase_receipts_po_idx` ON `purchase_receipts` (`purchase_order_id`);--> statement-breakpoint
CREATE TABLE `supplier_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`supplier_id` integer NOT NULL,
	`variant_id` integer NOT NULL,
	`supplier_sku` text,
	`pack_size` integer,
	`min_order_quantity` integer,
	`is_preferred` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "supplier_items_status" CHECK("supplier_items"."status" in ('active', 'archived')),
	CONSTRAINT "supplier_items_quantities" CHECK(("supplier_items"."pack_size" is null or "supplier_items"."pack_size" > 0) and ("supplier_items"."min_order_quantity" is null or "supplier_items"."min_order_quantity" > 0)),
	CONSTRAINT "supplier_items_sku" CHECK("supplier_items"."supplier_sku" is null or trim("supplier_items"."supplier_sku") <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplier_items_unique` ON `supplier_items` (`supplier_id`,`variant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `supplier_items_preferred` ON `supplier_items` (`variant_id`) WHERE is_preferred = 1 and status = 'active';--> statement-breakpoint
CREATE INDEX `supplier_items_variant_idx` ON `supplier_items` (`variant_id`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`contact_name` text,
	`search_key` text NOT NULL,
	`phone_e164` text,
	`email` text,
	`payment_terms` text,
	`lead_time_days` integer,
	`notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	CONSTRAINT "suppliers_status" CHECK("suppliers"."status" in ('active', 'archived')),
	CONSTRAINT "suppliers_lead_time" CHECK("suppliers"."lead_time_days" is null or "suppliers"."lead_time_days" >= 0),
	CONSTRAINT "suppliers_phone_e164" CHECK("suppliers"."phone_e164" is null or ("suppliers"."phone_e164" glob '+[1-9][0-9]*' and length("suppliers"."phone_e164") between 8 and 16))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_name_unique` ON `suppliers` (`name`);--> statement-breakpoint
CREATE TABLE `page_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`page_id` integer NOT NULL,
	`locale` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`body_markdown` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "page_versions_locale" CHECK("page_versions"."locale" in ('es', 'en')),
	CONSTRAINT "page_versions_version" CHECK("page_versions"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_versions_unique` ON `page_versions` (`page_id`,`locale`,`version`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`is_published` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_slug_unique` ON `pages` (`slug`);--> statement-breakpoint
CREATE TABLE `shipping_zone_translations` (
	`zone_id` integer NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	PRIMARY KEY(`zone_id`, `locale`),
	FOREIGN KEY (`zone_id`) REFERENCES `shipping_zones`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shipping_zones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`method` text NOT NULL,
	`fee` integer NOT NULL,
	`free_from` integer,
	`delivery_days_min` integer NOT NULL,
	`delivery_days_max` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "shipping_zones_method" CHECK("shipping_zones"."method" in ('pickup', 'own_delivery', 'courier')),
	CONSTRAINT "shipping_zones_status" CHECK("shipping_zones"."status" in ('active', 'archived')),
	CONSTRAINT "shipping_zones_amounts" CHECK("shipping_zones"."fee" >= 0 and ("shipping_zones"."free_from" is null or "shipping_zones"."free_from" >= 0)),
	CONSTRAINT "shipping_zones_days" CHECK("shipping_zones"."delivery_days_min" >= 0 and "shipping_zones"."delivery_days_max" >= "shipping_zones"."delivery_days_min")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shipping_zones_slug_unique` ON `shipping_zones` (`slug`);--> statement-breakpoint
CREATE TABLE `store_payment_methods` (
	`method` text PRIMARY KEY NOT NULL,
	CONSTRAINT "store_payment_methods_method" CHECK("store_payment_methods"."method" in ('bank_transfer', 'cash_on_delivery', 'payment_link', 'cash'))
);
--> statement-breakpoint
CREATE TABLE `store_promise_translations` (
	`promise_id` integer NOT NULL,
	`locale` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	PRIMARY KEY(`promise_id`, `locale`),
	FOREIGN KEY (`promise_id`) REFERENCES `store_promises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `store_promises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`is_published` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_promises_slug_unique` ON `store_promises` (`slug`);--> statement-breakpoint
CREATE TABLE `store_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`default_locale` text NOT NULL,
	`whatsapp_number` text,
	`legal_name` text,
	`tax_id_label` text,
	`tax_id` text,
	`address` text,
	`phone` text,
	`email` text,
	`time_zone` text,
	`country_code` text(2),
	`order_code_prefix` text,
	`max_quantity_per_line` integer,
	`min_shelf_life_days` integer,
	`expiry_warning_days` integer,
	`return_window_days` integer,
	`founding_year` integer,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	CONSTRAINT "store_settings_single_row" CHECK("store_settings"."id" = 1),
	CONSTRAINT "store_settings_currency" CHECK(length("store_settings"."currency") = 3),
	CONSTRAINT "store_settings_country" CHECK("store_settings"."country_code" is null or length("store_settings"."country_code") = 2),
	CONSTRAINT "store_settings_days" CHECK(("store_settings"."max_quantity_per_line" is null or "store_settings"."max_quantity_per_line" > 0) and ("store_settings"."min_shelf_life_days" is null or "store_settings"."min_shelf_life_days" > 0) and ("store_settings"."expiry_warning_days" is null or "store_settings"."expiry_warning_days" > 0) and ("store_settings"."return_window_days" is null or "store_settings"."return_window_days" > 0))
);
--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `accounts_userId_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limits_key_unique` ON `rate_limits` (`key`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `sessions_userId_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`role` text,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verifications_identifier_idx` ON `verifications` (`identifier`);