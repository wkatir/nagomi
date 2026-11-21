ALTER TABLE `category_translations` ADD `description` text;--> statement-breakpoint
ALTER TABLE `concern_translations` ADD `description` text;--> statement-breakpoint
ALTER TABLE `concern_translations` ADD `seo_title` text;--> statement-breakpoint
ALTER TABLE `concern_translations` ADD `seo_description` text;--> statement-breakpoint
ALTER TABLE `routines` ADD `concern_id` integer REFERENCES concerns(id);--> statement-breakpoint
ALTER TABLE `store_settings` ADD `founding_year` integer;