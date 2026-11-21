CREATE TABLE `tax_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`dte_type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`idempotency_key` text NOT NULL,
	`request` text NOT NULL,
	`expected_total` integer NOT NULL,
	`provider_id` text,
	`control_number` text,
	`generation_code` text,
	`seal` text,
	`issued_on` text,
	`taxed` integer,
	`iva` integer,
	`total` integer,
	`rejection` text,
	`error` text,
	`json_key` text,
	`pdf_key` text,
	`public_token` text NOT NULL,
	`void_reason` text,
	`void_responsible` text,
	`voided_at` text,
	`voided_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`created_by` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tax_documents_dte_type" CHECK("tax_documents"."dte_type" in ('01')),
	CONSTRAINT "tax_documents_status" CHECK("tax_documents"."status" in ('queued', 'processing', 'contingency', 'sealed', 'rejected', 'failed', 'voided')),
	CONSTRAINT "tax_documents_expected_total" CHECK("tax_documents"."expected_total" > 0),
	CONSTRAINT "tax_documents_issued_on" CHECK("tax_documents"."issued_on" is null or "tax_documents"."issued_on" glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "tax_documents_emitted" CHECK("tax_documents"."status" in ('queued', 'failed') or ("tax_documents"."provider_id" is not null and "tax_documents"."control_number" is not null and "tax_documents"."generation_code" is not null and "tax_documents"."issued_on" is not null and "tax_documents"."total" is not null)),
	CONSTRAINT "tax_documents_sealed" CHECK("tax_documents"."status" not in ('sealed', 'voided') or "tax_documents"."seal" is not null),
	CONSTRAINT "tax_documents_voided" CHECK("tax_documents"."status" <> 'voided' or ("tax_documents"."voided_at" is not null and "tax_documents"."void_reason" is not null and "tax_documents"."void_responsible" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_documents_idempotency_key_unique` ON `tax_documents` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `tax_documents_provider_id_unique` ON `tax_documents` (`provider_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tax_documents_generation_code_unique` ON `tax_documents` (`generation_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `tax_documents_public_token_unique` ON `tax_documents` (`public_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `tax_documents_live_invoice` ON `tax_documents` (`order_id`) WHERE dte_type = '01' and status not in ('rejected', 'failed', 'voided');--> statement-breakpoint
CREATE INDEX `tax_documents_order_idx` ON `tax_documents` (`order_id`);--> statement-breakpoint
CREATE INDEX `tax_documents_status_idx` ON `tax_documents` (`status`);--> statement-breakpoint
CREATE INDEX `tax_documents_issued_idx` ON `tax_documents` (`issued_on`);