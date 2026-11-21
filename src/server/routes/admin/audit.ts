import { and, asc, desc, eq, exists, gte, like, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "#/db";
import type { Feed } from "#/lib/list";
import { auditFilterShape } from "#/lib/schemas/audit";
import { fromAfterTo, fromNotAfterTo } from "#/lib/schemas/dates";
import type { AdminEnv } from "#/server/auth";
import { validate } from "#/server/validate";
import { withinLocalDays } from "../../domain/d1";
import { pageOf } from "../../domain/paging";
import { getSettings } from "../../domain/settings";

const { auditEvents, users } = schema;

const listQuery = z
	.object({
		...auditFilterShape,
		entityId: z.string().trim().min(1).max(40).optional(),
		// A value ending in "." matches every action it starts.
		action: z.string().trim().min(1).max(60).optional(),
		cursor: z.coerce.number().int().positive().optional(),
		limit: z.coerce.number().int().min(1).max(200).default(50),
	})
	.refine((q) => !q.entityId || q.entityType, {
		message: "entityId needs entityType",
		path: ["entityId"],
	})
	.refine(fromNotAfterTo, fromAfterTo);

export const auditRouter = new Hono<AdminEnv>()
	.get("/", validate("query", listQuery), async (c) => {
		const db = getDb();
		const q = c.req.valid("query");
		const { timeZone } = await getSettings(db);
		const action = q.action?.endsWith(".")
			? and(
					gte(auditEvents.action, q.action),
					lt(auditEvents.action, `${q.action.slice(0, -1)}/`),
				)
			: q.action
				? eq(auditEvents.action, q.action)
				: undefined;
		const rows = await db
			.select({
				id: auditEvents.id,
				action: auditEvents.action,
				entityType: auditEvents.entityType,
				entityId: auditEvents.entityId,
				data: auditEvents.data,
				createdAt: auditEvents.createdAt,
				actorUserId: auditEvents.actorUserId,
				actorName: users.name,
				actorEmail: users.email,
			})
			.from(auditEvents)
			.leftJoin(users, eq(users.id, auditEvents.actorUserId))
			.where(
				and(
					q.entityType ? eq(auditEvents.entityType, q.entityType) : undefined,
					q.entityId ? eq(auditEvents.entityId, q.entityId) : undefined,
					q.actor ? eq(auditEvents.actorUserId, q.actor) : undefined,
					q.verb ? like(auditEvents.action, `%.${q.verb}`) : undefined,
					action,
					withinLocalDays(auditEvents.createdAt, q, timeZone),
					q.cursor ? lt(auditEvents.id, q.cursor) : undefined,
				),
			)
			.orderBy(desc(auditEvents.id))
			.limit(q.limit + 1);
		const { page, nextCursor } = pageOf(rows, q.limit);
		return c.json({ items: page, nextCursor } satisfies Feed<
			(typeof page)[number]
		>);
	})
	.get("/actors", async (c) => {
		const db = getDb();
		return c.json(
			await db
				.select({ id: users.id, name: users.name, email: users.email })
				.from(users)
				.where(
					exists(
						db
							.select({ one: sql`1` })
							.from(auditEvents)
							.where(eq(auditEvents.actorUserId, users.id)),
					),
				)
				.orderBy(asc(users.name), asc(users.id)),
		);
	});
