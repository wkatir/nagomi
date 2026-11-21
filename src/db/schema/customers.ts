import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { actor, createdAt, id, now, oneOf } from "./_helpers";
import { CONSENT_CHANNELS, CONSENT_PURPOSES } from "./enums";
import { orders } from "./orders";
import { pageVersions } from "./store";

// The phone (E.164, e.g. +50371234567) is the identity.
export const customers = sqliteTable(
	"customers",
	{
		id: id(),
		name: text("name"),
		phoneE164: text("phone_e164").unique(),
		email: text("email"),
		// searchKey() of name, email and phone digits (src/server/domain/search.ts), written by the API.
		searchKey: text("search_key").notNull(),

		notes: text("notes"),
		createdAt: createdAt(),
	},
	(t) => [
		check(
			"customers_phone_e164",
			sql`${t.phoneE164} is null or (${t.phoneE164} glob '+[1-9][0-9]*' and length(${t.phoneE164}) between 8 and 16)`,
		),
	],
);

// Append-only: a withdrawal is a new row with granted = false. The current consent is the
// latest row per (customer, purpose). Each row points at the exact page version shown.
// A consent given at checkout belongs to the order and gets its customer once the order is
// linked to one (the only change a row accepts).
export const customerConsents = sqliteTable(
	"customer_consents",
	{
		id: id(),
		customerId: integer("customer_id").references(() => customers.id),
		orderId: integer("order_id").references(() => orders.id),
		purpose: text("purpose", { enum: CONSENT_PURPOSES }).notNull(),
		granted: integer("granted", { mode: "boolean" }).notNull(),
		pageVersionId: integer("page_version_id")
			.notNull()
			.references(() => pageVersions.id),
		channel: text("channel", { enum: CONSENT_CHANNELS }).notNull(),
		recordedAt: text("recorded_at").notNull().default(now),
		// Null when the customer gave it on the web; otherwise the admin who recorded it.
		recordedBy: actor("recorded_by"),
	},
	(t) => [
		oneOf("customer_consents_purpose", t.purpose, CONSENT_PURPOSES),
		oneOf("customer_consents_channel", t.channel, CONSENT_CHANNELS),
		check(
			"customer_consents_owner",
			sql`${t.customerId} is not null or ${t.orderId} is not null`,
		),
		index("customer_consents_customer_idx").on(t.customerId, t.purpose, t.id),
		index("customer_consents_order_idx").on(t.orderId),
	],
);
