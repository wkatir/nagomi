import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { mapDbError } from "./domain/db-errors";
import { InvalidPhoneError } from "./domain/phone";
import { StoreNotConfiguredError } from "./domain/settings";

export const apiError: ErrorHandler = (err, c) => {
	if (err instanceof HTTPException) return err.getResponse();
	if (err instanceof InvalidPhoneError)
		return c.json({ error: "invalid_phone" }, 400);
	if (err instanceof StoreNotConfiguredError)
		return c.json({ error: "store_not_configured", fields: err.fields }, 503);
	// The whole batch rolled back, so the request can be retried after a reload.
	const refused = mapDbError(err);
	if (refused) {
		console.warn(`${c.req.method} ${c.req.path}: ${refused.cause}`);
		return c.json({ error: refused.error }, refused.status);
	}
	console.error(err);
	return c.json({ error: "internal_error" }, 500);
};
