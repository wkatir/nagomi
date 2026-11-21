import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type Db, getDb, schema } from "#/db";
import { ARCHIVABLE_STATUSES, SHIPPING_METHODS } from "#/db/schema";
import {
	ZONE_MAX_AMOUNT,
	ZONE_MAX_DAYS,
	ZONE_MAX_POSITION,
	zoneListSearch,
} from "#/lib/schemas/shipping";
import type { AdminEnv } from "#/server/auth";
import { idParam, invalidRequest, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { statusAudit } from "../../domain/audit-actions";
import { nonEmpty } from "../../domain/d1";
import { readSettings } from "../../domain/settings";
import { pagedZones, zoneDetail, zoneOptions } from "../../domain/zone-queries";
import {
	localeParam,
	optionalText,
	requiredText,
	slug,
	translationEntries,
	translations,
} from "./catalog-inputs";

const { shippingZones, shippingZoneTranslations } = schema;

const money = z.number().int().min(0).max(ZONE_MAX_AMOUNT);
const days = z.number().int().min(0).max(ZONE_MAX_DAYS);

const zoneText = z.object({
	name: requiredText(80),
	description: optionalText(300),
});

const zoneFields = z.object({
	method: z.enum(SHIPPING_METHODS),
	fee: money,
	// Merchandise total after discount that waives the fee; null: never free.
	freeFrom: money.nullable(),
	deliveryDaysMin: days,
	deliveryDaysMax: days,
	position: z.number().int().min(0).max(ZONE_MAX_POSITION),
	status: z.enum(ARCHIVABLE_STATUSES),
});
const daysInOrder = (z: { deliveryDaysMin: number; deliveryDaysMax: number }) =>
	z.deliveryDaysMin <= z.deliveryDaysMax;
const daysOutOfOrder = {
	message: "deliveryDaysMax is before deliveryDaysMin",
	path: ["deliveryDaysMax"],
};
const zoneState = zoneFields.refine(daysInOrder, daysOutOfOrder);

const createInput = zoneFields
	.extend({ slug, translations: translations(zoneText) })
	.partial({ position: true, status: true })
	.refine(daysInOrder, daysOutOfOrder);

async function written(db: Db, id: number) {
	const zone = await zoneDetail(db, id);
	if (!zone) throw new Error(`Shipping zone ${id} missing`);
	return zone;
}

export const shippingRouter = new Hono<AdminEnv>()
	.get("/", validate("query", zoneListSearch), async (c) => {
		const db = getDb();
		const { defaultLocale } = await readSettings(db);
		return c.json(await pagedZones(db, c.req.valid("query"), defaultLocale));
	})
	// Declared before `/:id`, which would take "options" for an id.
	.get("/options", async (c) => c.json(await zoneOptions(getDb())))
	.get("/:id", validate("param", idParam), async (c) => {
		const zone = await zoneDetail(getDb(), c.req.valid("param").id);
		if (!zone) return c.json({ error: "not_found" }, 404);
		return c.json(zone);
	})
	.post("/", validate("json", createInput), async (c) => {
		const db = getDb();
		const { translations, ...zone } = c.req.valid("json");
		const { defaultLocale } = await readSettings(db);
		if (!translations[defaultLocale])
			return c.json({ error: "publish_requires_default_translation" }, 409);
		const exists = await db.query.shippingZones.findFirst({
			where: eq(shippingZones.slug, zone.slug),
		});
		if (exists) return c.json({ error: "duplicate_slug" }, 409);
		const zoneId = sql<number>`(select id from shipping_zones where slug = ${zone.slug})`;
		await db.batch([
			db.insert(shippingZones).values(zone),
			...translationEntries(translations).map(([locale, text]) =>
				db.insert(shippingZoneTranslations).values({ zoneId, locale, ...text }),
			),
			audit(db, {
				actorUserId: c.var.adminUserId,
				action: "shipping_zone.create",
				entityType: "shipping_zone",
				entityId: zoneId,
				data: { ...zone, translations },
			}),
		]);
		const created = await db.query.shippingZones.findFirst({
			where: eq(shippingZones.slug, zone.slug),
		});
		if (!created) throw new Error(`Shipping zone ${zone.slug} missing`);
		return c.json(await written(db, created.id), 201);
	})
	// Confirmed orders keep the fee they were given.
	.patch(
		"/:id",
		validate("param", idParam),
		validate(
			"json",
			zoneFields
				.partial()
				.extend({ translations: translations(zoneText).optional() })
				.refine((v) => Object.keys(v).length > 0, "Nothing to change"),
		),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { translations: texts, ...patch } = c.req.valid("json");
			const stored = await db.query.shippingZones.findFirst({
				where: eq(shippingZones.id, id),
			});
			if (!stored) return c.json({ error: "not_found" }, 404);
			const state = zoneState.safeParse({ ...stored, ...patch });
			if (!state.success) return invalidRequest(c, state.error);
			if (patch.status === "active" && stored.status !== "active") {
				const { defaultLocale } = await readSettings(db);
				const named =
					texts?.[defaultLocale] ??
					(await db.query.shippingZoneTranslations.findFirst({
						where: and(
							eq(shippingZoneTranslations.zoneId, id),
							eq(shippingZoneTranslations.locale, defaultLocale),
						),
					}));
				if (!named)
					return c.json({ error: "publish_requires_default_translation" }, 409);
			}
			await db.batch(
				nonEmpty([
					audit(db, {
						actorUserId: c.var.adminUserId,
						...statusAudit("shipping_zone", id, stored.status, patch.status, {
							before: stored,
							patch,
							...(texts ? { translations: texts } : {}),
						}),
					}),
					...(Object.keys(patch).length > 0
						? [
								db
									.update(shippingZones)
									.set(patch)
									.where(eq(shippingZones.id, id)),
							]
						: []),
					...translationEntries(texts ?? {}).map(([locale, text]) =>
						db
							.insert(shippingZoneTranslations)
							.values({ zoneId: id, locale, ...text })
							.onConflictDoUpdate({
								target: [
									shippingZoneTranslations.zoneId,
									shippingZoneTranslations.locale,
								],
								set: text,
							}),
					),
				]),
			);
			return c.json(await written(db, id));
		},
	)
	.put(
		"/:id/translations/:locale",
		validate("param", localeParam),
		validate("json", zoneText),
		async (c) => {
			const db = getDb();
			const { id, locale } = c.req.valid("param");
			const text = c.req.valid("json");
			const zone = await db.query.shippingZones.findFirst({
				where: eq(shippingZones.id, id),
			});
			if (!zone) return c.json({ error: "not_found" }, 404);
			const [[row]] = await db.batch([
				db
					.insert(shippingZoneTranslations)
					.values({ zoneId: id, locale, ...text })
					.onConflictDoUpdate({
						target: [
							shippingZoneTranslations.zoneId,
							shippingZoneTranslations.locale,
						],
						set: text,
					})
					.returning(),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "shipping_zone.update",
					entityType: "shipping_zone",
					entityId: id,
					data: { translation: locale, ...text },
				}),
			]);
			return c.json(row);
		},
	);
