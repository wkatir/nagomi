import { is, SQL, type SQLWrapper, sql } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import { insertIfExists } from "./d1";

const { auditEvents } = schema;

export type AuditEvent = {
	actorUserId: string;
	action: string;
	entityType: string;
	// A subquery for a row inserted in the same batch.
	entityId: number | SQL<number>;
	data?: unknown;
};

const row = (e: AuditEvent) => ({
	actorUserId: e.actorUserId,
	action: e.action,
	entityType: e.entityType,
	entityId: is(e.entityId, SQL)
		? sql<string>`cast(${e.entityId} as text)`
		: String(e.entityId),
	data: e.data ?? null,
});

// With a guard, written only while the guard still finds a row, like the change itself.
export const audit = (db: Db, event: AuditEvent, guard?: SQLWrapper) =>
	guard
		? insertIfExists(db, auditEvents, row(event), guard)
		: db.insert(auditEvents).values(row(event));
