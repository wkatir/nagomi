import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { actor, createdAt, id } from "./_helpers";

// Append-only, written in the same batch as the change it records.
export const auditEvents = sqliteTable(
	"audit_events",
	{
		id: id(),
		actorUserId: actor("actor_user_id").notNull(),
		// <entity>.create, .update, .archive or .status (with from and to in data), e.g.
		// "order.status", "payment.create", "settings.update"
		action: text("action").notNull(),
		entityType: text("entity_type").notNull(),
		entityId: text("entity_id").notNull(),
		data: text("data", { mode: "json" }),
		createdAt: createdAt(),
	},
	(t) => [
		index("audit_events_entity_idx").on(t.entityType, t.entityId, t.id),
		index("audit_events_created_idx").on(t.createdAt),
		index("audit_events_actor_idx").on(t.actorUserId, t.id),
		// audit_events_order_idx on json_extract(data, '$.orderId') is in the custom
		// migration (drizzle-kit cannot write expression indexes).
	],
);
