import { eq } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import { PAYMENT_METHODS } from "#/db/schema";
import { REQUIRED_SETTINGS } from "./store-rules";

const { storePaymentMethods, storeSettings } = schema;

type Row = typeof storeSettings.$inferSelect;
export type StoreSettings = Omit<Row, (typeof REQUIRED_SETTINGS)[number]> & {
	[K in (typeof REQUIRED_SETTINGS)[number]]: NonNullable<Row[K]>;
};

// Answered as 503 store_not_configured (src/server/api-error.ts).
export class StoreNotConfiguredError extends Error {
	constructor(readonly fields: string[]) {
		super(`store_settings is missing ${fields.join(", ")}`);
	}
}

export async function readSettings(db: Db): Promise<Row> {
	const row = await db.query.storeSettings.findFirst({
		where: eq(storeSettings.id, 1),
	});
	if (!row) throw new Error("store_settings row is missing; run the seed");
	return row;
}

export async function getSettings(db: Db): Promise<StoreSettings> {
	const row = await readSettings(db);
	const missing = REQUIRED_SETTINGS.filter((key) => row[key] === null);
	if (missing.length > 0) throw new StoreNotConfiguredError(missing);
	return row as StoreSettings;
}

export async function getPaymentMethods(db: Db) {
	const rows = await db.select().from(storePaymentMethods);
	const accepted = new Set(rows.map((r) => r.method));
	return PAYMENT_METHODS.filter((method) => accepted.has(method));
}
