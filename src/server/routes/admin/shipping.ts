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
import { SV_MUNICIPALITIES } from "#/lib/sv-locations";
import type { AdminEnv } from "#/server/auth";
import { idParam, invalidRequest, patchOf, validate } from "#/server/validate";
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

const { shippingZoneMunicipalities, shippingZones, shippingZoneTranslations } =
	schema;

const money = z.number().int().min(0).max(ZONE_MAX_AMOUNT);
const days = z.number().int().min(0).max(ZONE_MAX_DAYS);

const zoneText = z.object({
	name: requiredText(80),
	description: optionalText(300),
});

const zoneFields = z.object({
	method: z.enum(SHIPPING_METHODS),
	fee: money,
	coversRest: z.boolean(),
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

const municipalities = z
	.array(z.enum(SV_MUNICIPALITIES as [string, ...string[]]))
	.max(SV_MUNICIPALITIES.length)
	.refine((x) => new Set(x).size === x.length, "Duplicate municipality");

const createInput = zoneFields
	.extend({
		slug,
		translations: translations(zoneText),
		municipalities: municipalities.default([]),
	})
	.partial({ position: true, status: true, coversRest: true })
	.refine(daysInOrder, daysOutOfOrder);

async function municipalitiesTaken(db: Db, wanted: string[], zoneId: number) {
	if (wanted.length === 0) return [];
	const rows = await db
		.select({
			municipality: shippingZoneMunicipalities.municipality,
			zoneId: shippingZoneMunicipalities.zoneId,
		})
		.from(shippingZoneMunicipalities);
	return rows
		.filter((r) => r.zoneId !== zoneId && wanted.includes(r.municipality))
		.map((r) => r.municipality);
}

const coverageRefused = (
	coversRest: boolean | undefined,
	municipalities: string[] | undefined,
) =>
	coversRest === true &&
	municipalities !== undefined &&
	municipalities.length > 0;

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
		const {
			translations,
			municipalities: places,
			...zone
		} = c.req.valid("json");
		if (coverageRefused(zone.coversRest, places))
			return c.json({ error: "zone_covers_rest" }, 409);
		const { defaultLocale } = await readSettings(db);
		if (!translations[defaultLocale])
			return c.json({ error: "publish_requires_default_translation" }, 409);
		const exists = await db.query.shippingZones.findFirst({
			where: eq(shippingZones.slug, zone.slug),
		});
		if (exists) return c.json({ error: "duplicate_slug" }, 409);
		const taken = await municipalitiesTaken(db, places, 0);
		if (taken.length > 0)
			return c.json({ error: "municipality_in_other_zone", taken }, 409);
		const zoneId = sql<number>`(select id from shipping_zones where slug = ${zone.slug})`;
		await db.batch([
			db.insert(shippingZones).values(zone),
			...places.map((municipality) =>
				db.insert(shippingZoneMunicipalities).values({ zoneId, municipality }),
			),
			...translationEntries(translations).map(([locale, text]) =>
				db.insert(shippingZoneTranslations).values({ zoneId, locale, ...text }),
			),
			audit(db, {
				actorUserId: c.var.adminUserId,
				action: "shipping_zone.create",
				entityType: "shipping_zone",
				entityId: zoneId,
				data: { ...zone, translations, municipalities: places },
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
			patchOf(
				zoneFields.extend({
					translations: translations(zoneText).optional(),
					municipalities: municipalities.optional(),
				}),
			),
		),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const {
				translations: texts,
				municipalities: places,
				...patch
			} = c.req.valid("json");
			const stored = await db.query.shippingZones.findFirst({
				where: eq(shippingZones.id, id),
			});
			if (!stored) return c.json({ error: "not_found" }, 404);
			const state = zoneState.safeParse({ ...stored, ...patch });
			if (!state.success) return invalidRequest(c, state.error);
			const current =
				places ??
				(
					await db
						.select({ m: shippingZoneMunicipalities.municipality })
						.from(shippingZoneMunicipalities)
						.where(eq(shippingZoneMunicipalities.zoneId, id))
				).map((r) => r.m);
			if (coverageRefused(state.data.coversRest, current))
				return c.json({ error: "zone_covers_rest" }, 409);
			if (places) {
				const taken = await municipalitiesTaken(db, places, id);
				if (taken.length > 0)
					return c.json({ error: "municipality_in_other_zone", taken }, 409);
			}
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
							...(places ? { municipalities: places } : {}),
						}),
					}),
					...(places
						? [
								db
									.delete(shippingZoneMunicipalities)
									.where(eq(shippingZoneMunicipalities.zoneId, id)),
								...places.map((municipality) =>
									db
										.insert(shippingZoneMunicipalities)
										.values({ zoneId: id, municipality }),
								),
							]
						: []),
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
