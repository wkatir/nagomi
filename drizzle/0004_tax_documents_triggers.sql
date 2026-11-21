-- Tax documents are permanent records of what Hacienda knows: never deleted, their status
-- only moves forward, and what identifies them never changes once known. Same splitter
-- rules as 0001: uppercase block keywords, no conditional expressions in trigger bodies, LF.
CREATE TRIGGER `tax_documents_no_delete` BEFORE DELETE ON `tax_documents`
BEGIN
	SELECT RAISE(ABORT, 'tax_documents_are_permanent');
END;
--> statement-breakpoint
CREATE TRIGGER `tax_documents_status_flow` BEFORE UPDATE OF `status` ON `tax_documents`
WHEN NEW.`status` <> OLD.`status` AND NOT (
	(OLD.`status` = 'queued' AND NEW.`status` IN ('processing', 'contingency', 'sealed', 'rejected', 'failed'))
	OR (OLD.`status` IN ('processing', 'contingency') AND NEW.`status` IN ('processing', 'contingency', 'sealed', 'rejected'))
	OR (OLD.`status` = 'sealed' AND NEW.`status` = 'voided')
)
BEGIN
	SELECT RAISE(ABORT, 'tax_document_status_flow');
END;
--> statement-breakpoint
CREATE TRIGGER `tax_documents_identity_fixed` BEFORE UPDATE ON `tax_documents`
WHEN NEW.`order_id` IS NOT OLD.`order_id`
	OR NEW.`dte_type` IS NOT OLD.`dte_type`
	OR NEW.`idempotency_key` IS NOT OLD.`idempotency_key`
	OR NEW.`request` IS NOT OLD.`request`
	OR NEW.`expected_total` IS NOT OLD.`expected_total`
	OR NEW.`public_token` IS NOT OLD.`public_token`
	OR NEW.`created_at` IS NOT OLD.`created_at`
	OR NEW.`created_by` IS NOT OLD.`created_by`
	OR (OLD.`provider_id` IS NOT NULL AND NEW.`provider_id` IS NOT OLD.`provider_id`)
	OR (OLD.`control_number` IS NOT NULL AND NEW.`control_number` IS NOT OLD.`control_number`)
	OR (OLD.`generation_code` IS NOT NULL AND NEW.`generation_code` IS NOT OLD.`generation_code`)
	OR (OLD.`issued_on` IS NOT NULL AND NEW.`issued_on` IS NOT OLD.`issued_on`)
	OR (OLD.`total` IS NOT NULL AND NEW.`total` IS NOT OLD.`total`)
	OR (OLD.`seal` IS NOT NULL AND NEW.`seal` IS NOT OLD.`seal`)
	OR (OLD.`json_key` IS NOT NULL AND NEW.`json_key` IS NOT OLD.`json_key`)
	OR (OLD.`pdf_key` IS NOT NULL AND NEW.`pdf_key` IS NOT OLD.`pdf_key`)
BEGIN
	SELECT RAISE(ABORT, 'tax_document_fixed');
END;
