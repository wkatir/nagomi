import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { ARCHIVABLE_STATUSES } from "#/lib/enums";
import { SV_LOCATIONS } from "#/lib/sv-locations";
import { users } from "../auth-schema";
import { actor, createdAt, id, now, oneOf, updatedAt } from "./_helpers";
import { CONSENT_CHANNELS, CONSENT_PURPOSES } from "./enums";
import { orders } from "./orders";
import { pageVersions } from "./store";

const SV_PHONE = "'+503[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'";
const SV_PLACES = SV_LOCATIONS.flatMap((l) =>
	l.municipalities.map((m) => `${l.department}|${m}`),
);

// The email (lower case, trimmed) is the identity; a guest order may have only a phone.
export const customers = sqliteTable(
	"customers",
	{
		id: id(),
		authUserId: text("auth_user_id").references(() => users.id),
		name: text("name"),
		phoneE164: text("phone_e164").unique(),
		email: text("email"),
		searchKey: text("search_key").notNull(),

		notes: text("notes"),
		createdAt: createdAt(),
	},
	(t) => [
		check(
			"customers_phone_e164",
			sql`${t.phoneE164} is null or ${t.phoneE164} glob ${sql.raw(SV_PHONE)}`,
		),
		check(
			"customers_email_normalized",
			sql`${t.email} is null or (${t.email} = lower(trim(${t.email})) and ${t.email} like '%_@_%')`,
		),
		uniqueIndex("customers_email_unique")
			.on(t.email)
			.where(sql`email is not null`),
		uniqueIndex("customers_auth_user_unique")
			.on(t.authUserId)
			.where(sql`auth_user_id is not null`),
	],
);

export const customerAddresses = sqliteTable(
	"customer_addresses",
	{
		id: id(),
		customerId: integer("customer_id")
			.notNull()
			.references(() => customers.id),
		recipientName: text("recipient_name").notNull(),
		department: text("department").notNull(),
		municipality: text("municipality").notNull(),
		addressLine: text("address_line").notNull(),
		reference: text("reference"),
		phoneE164: text("phone_e164").notNull(),
		isDefault: integer("is_default", { mode: "boolean" })
			.notNull()
			.default(false),
		status: text("status", { enum: ARCHIVABLE_STATUSES })
			.notNull()
			.default("active"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [
		oneOf("customer_addresses_status", t.status, ARCHIVABLE_STATUSES),
		check(
			"customer_addresses_place",
			sql`${t.department} || '|' || ${t.municipality} in (${sql.raw(SV_PLACES.map((p) => `'${p}'`).join(", "))})`,
		),
		check(
			"customer_addresses_phone",
			sql`${t.phoneE164} glob ${sql.raw(SV_PHONE)}`,
		),
		check(
			"customer_addresses_text",
			sql`trim(${t.recipientName}) <> '' and trim(${t.addressLine}) <> ''`,
		),
		check(
			"customer_addresses_default_active",
			sql`${t.isDefault} = 0 or ${t.status} = 'active'`,
		),
		uniqueIndex("customer_addresses_one_default")
			.on(t.customerId)
			.where(sql`is_default = 1`),
		index("customer_addresses_customer_idx").on(t.customerId, t.status),
	],
);

// Append-only: a withdrawal is a new row with granted = false; the latest row per (customer,
// purpose) is current. A checkout consent gets its customer once the order is linked to one.
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
