import { desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type Db, getDb, schema } from "#/db";
import { now, PROMOTION_STATUSES, PROMOTION_TYPES } from "#/db/schema";
import { calendarDate } from "#/lib/schemas/dates";
import {
	PROMOTION_CODE,
	PROMOTION_MAX_AMOUNT,
	PROMOTION_MAX_USES,
	promotionListSearch,
} from "#/lib/schemas/promotions";
import type { AdminEnv } from "#/server/auth";
import { idParam, invalidRequest, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { statusAudit } from "../../domain/audit-actions";
import {
	pagedPromotions,
	promotionDetail,
	promotionTermsLocked,
} from "../../domain/promotion-queries";
import { readSettings } from "../../domain/settings";
import {
	localeParam,
	translationEntries,
	translations,
} from "./catalog-inputs";

const { orders, promotions, promotionTranslations } = schema;

const money = z.number().int().positive().max(PROMOTION_MAX_AMOUNT);
const limit = z.number().int().positive().max(PROMOTION_MAX_USES).nullable();
const promotionText = z.object({
	description: z.string().trim().min(1).max(200),
});
const promotionFields = z.object({
	code: z
		.string()
		.trim()
		.toUpperCase()
		.regex(PROMOTION_CODE, "3 to 32 letters, digits, - or _"),
	type: z.enum(PROMOTION_TYPES),
	// percentage: whole percent 1-100; fixed: minor units.
	value: money,
	minSubtotal: money.nullable(),
	// Local days of the store, both included; null leaves that side open.
	startsOn: calendarDate.nullable(),
	endsOn: calendarDate.nullable(),
	usageLimit: limit,
	perCustomerLimit: limit,
	status: z.enum(PROMOTION_STATUSES),
});
// The table checks, applied to the promotion as it would be stored.
const promotionState = z
	.object({
		type: z.enum(PROMOTION_TYPES),
		value: z.number(),
		startsOn: z.string().nullable(),
		endsOn: z.string().nullable(),
	})
	.refine((p) => p.type !== "percentage" || p.value <= 100, {
		message: "A percentage is at most 100",
		path: ["value"],
	})
	.refine((p) => !p.startsOn || !p.endsOn || p.startsOn <= p.endsOn, {
		message: "endsOn is before startsOn",
		path: ["endsOn"],
	});
// Fixed once an order used the code (also a trigger): orders keep a discount derived
// from them.
const TERMS = ["code", "type", "value", "minSubtotal"] as const;

async function written(db: Db, id: number) {
	const promotion = await promotionDetail(db, id);
	if (!promotion) throw new Error(`Promotion ${id} missing`);
	return promotion;
}

export const promotionsRouter = new Hono<AdminEnv>()
	.get("/", validate("query", promotionListSearch), async (c) =>
		c.json(await pagedPromotions(getDb(), c.req.valid("query"))),
	)
	.get("/:id", validate("param", idParam), async (c) => {
		const db = getDb();
		const { id } = c.req.valid("param");
		const promotion = await promotionDetail(db, id);
		if (!promotion) return c.json({ error: "not_found" }, 404);
		const recentOrders = await db
			.select({
				id: orders.id,
				code: orders.code,
				status: orders.status,
				subtotal: orders.subtotal,
				discount: orders.discount,
				total: orders.total,
				createdAt: orders.createdAt,
			})
			.from(orders)
			.where(eq(orders.promotionId, id))
			.orderBy(desc(orders.createdAt), desc(orders.id))
			.limit(50);
		return c.json({ ...promotion, recentOrders });
	})
	// The default locale's description is required: the storefront shows it with the
	// discount.
	.post(
		"/",
		validate(
			"json",
			promotionFields
				.partial({
					minSubtotal: true,
					startsOn: true,
					endsOn: true,
					usageLimit: true,
					perCustomerLimit: true,
					status: true,
				})
				.extend({ translations: translations(promotionText) }),
		),
		async (c) => {
			const db = getDb();
			const { translations: texts, ...fields } = c.req.valid("json");
			const state = promotionState.safeParse({
				startsOn: null,
				endsOn: null,
				...fields,
			});
			if (!state.success) return invalidRequest(c, state.error);
			const { defaultLocale } = await readSettings(db);
			if (!texts[defaultLocale])
				return c.json({ error: "publish_requires_default_translation" }, 409);
			const taken = await db.query.promotions.findFirst({
				where: eq(promotions.code, fields.code),
			});
			if (taken) return c.json({ error: "duplicate_code" }, 409);
			const promotionId = sql<number>`(select id from promotions where code = ${fields.code})`;
			await db.batch([
				db.insert(promotions).values(fields),
				...translationEntries(texts).map(([locale, text]) =>
					db
						.insert(promotionTranslations)
						.values({ promotionId, locale, ...text }),
				),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "promotion.create",
					entityType: "promotion",
					entityId: promotionId,
					data: { ...fields, translations: texts },
				}),
			]);
			const created = await db.query.promotions.findFirst({
				where: eq(promotions.code, fields.code),
			});
			if (!created) throw new Error(`Promotion ${fields.code} missing`);
			return c.json(await written(db, created.id), 201);
		},
	)
	.patch(
		"/:id",
		validate("param", idParam),
		validate(
			"json",
			promotionFields
				.partial()
				.extend({ translations: translations(promotionText).optional() })
				.refine((v) => Object.keys(v).length > 0, "Nothing to change"),
		),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { translations: texts, ...patch } = c.req.valid("json");
			const [row] = await db
				.select({ stored: promotions, locked: promotionTermsLocked })
				.from(promotions)
				.where(eq(promotions.id, id));
			if (!row) return c.json({ error: "not_found" }, 404);
			const { stored, locked } = row;
			const state = promotionState.safeParse({ ...stored, ...patch });
			if (!state.success) return invalidRequest(c, state.error);
			const changesTerms = TERMS.some(
				(k) => patch[k] !== undefined && patch[k] !== stored[k],
			);
			if (changesTerms && locked)
				return c.json({ error: "promotion_in_use" }, 409);
			if (patch.code && patch.code !== stored.code) {
				const taken = await db.query.promotions.findFirst({
					where: eq(promotions.code, patch.code),
				});
				if (taken) return c.json({ error: "duplicate_code" }, 409);
			}
			await db.batch([
				audit(db, {
					actorUserId: c.var.adminUserId,
					...statusAudit("promotion", id, stored.status, patch.status, {
						before: stored,
						patch,
						...(texts ? { translations: texts } : {}),
					}),
				}),
				db
					.update(promotions)
					.set({ ...patch, updatedAt: now })
					.where(eq(promotions.id, id)),
				...translationEntries(texts ?? {}).map(([locale, text]) =>
					db
						.insert(promotionTranslations)
						.values({ promotionId: id, locale, ...text })
						.onConflictDoUpdate({
							target: [
								promotionTranslations.promotionId,
								promotionTranslations.locale,
							],
							set: text,
						}),
				),
			]);
			return c.json(await written(db, id));
		},
	)
	.put(
		"/:id/translations/:locale",
		validate("param", localeParam),
		validate("json", promotionText),
		async (c) => {
			const db = getDb();
			const { id, locale } = c.req.valid("param");
			const text = c.req.valid("json");
			const promotion = await db.query.promotions.findFirst({
				where: eq(promotions.id, id),
			});
			if (!promotion) return c.json({ error: "not_found" }, 404);
			const [[row]] = await db.batch([
				db
					.insert(promotionTranslations)
					.values({ promotionId: id, locale, ...text })
					.onConflictDoUpdate({
						target: [
							promotionTranslations.promotionId,
							promotionTranslations.locale,
						],
						set: text,
					})
					.returning(),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "promotion.update",
					entityType: "promotion",
					entityId: id,
					data: { translation: locale, ...text },
				}),
			]);
			return c.json(row);
		},
	);
