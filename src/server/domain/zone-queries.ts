import { and, asc, count, eq, sql } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import type { Locale } from "#/db/schema";
import type { ZoneListSearch } from "#/lib/schemas/shipping";
import { inList, qualified } from "./d1";
import { pageWindow, sortBy, toPaged } from "./list-query";

const { shippingZoneMunicipalities, shippingZones, shippingZoneTranslations } =
	schema;

async function withTexts(db: Db, zones: (typeof shippingZones.$inferSelect)[]) {
	if (zones.length === 0) return [];
	const ids = zones.map((z) => z.id);
	const [texts, places] = await db.batch([
		db
			.select()
			.from(shippingZoneTranslations)
			.where(inList(shippingZoneTranslations.zoneId, ids)),
		db
			.select()
			.from(shippingZoneMunicipalities)
			.where(inList(shippingZoneMunicipalities.zoneId, ids))
			.orderBy(asc(shippingZoneMunicipalities.municipality)),
	]);
	return zones.map((zone) => ({
		...zone,
		municipalities: places
			.filter((p) => p.zoneId === zone.id)
			.map((p) => p.municipality),
		translations: texts.filter((t) => t.zoneId === zone.id),
	}));
}

export async function zoneDetail(db: Db, id: number) {
	const zones = await db
		.select()
		.from(shippingZones)
		.where(eq(shippingZones.id, id));
	const [zone] = await withTexts(db, zones);
	return zone ?? null;
}

export async function pagedZones(
	db: Db,
	query: ZoneListSearch,
	defaultLocale: Locale,
) {
	const where = and(
		query.status ? eq(shippingZones.status, query.status) : undefined,
		query.method ? eq(shippingZones.method, query.method) : undefined,
	);
	const sortColumns = {
		position: shippingZones.position,
		name: sql`(select t.name from shipping_zone_translations t where t.zone_id = ${qualified(shippingZones.id)} and t.locale = ${defaultLocale})`,
		method: shippingZones.method,
		fee: shippingZones.fee,
		// Days are at most 365, so the earliest delivery decides and the latest breaks ties.
		deliveryDays: sql`${shippingZones.deliveryDaysMin} * 1000 + ${shippingZones.deliveryDaysMax}`,
	};
	const { limit, offset } = pageWindow(query);
	const [zones, [counted]] = await db.batch([
		db
			.select()
			.from(shippingZones)
			.where(where)
			.orderBy(...sortBy(sortColumns, query.sort, query.dir, shippingZones.id))
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(shippingZones).where(where),
	]);
	return toPaged(await withTexts(db, zones), counted.total, query);
}

export async function zoneOptions(db: Db) {
	const active = eq(shippingZones.status, "active");
	const [zones, texts, places] = await db.batch([
		db
			.select({
				id: shippingZones.id,
				slug: shippingZones.slug,
				method: shippingZones.method,
				fee: shippingZones.fee,
				coversRest: shippingZones.coversRest,
				deliveryDaysMin: shippingZones.deliveryDaysMin,
				deliveryDaysMax: shippingZones.deliveryDaysMax,
			})
			.from(shippingZones)
			.where(active)
			.orderBy(asc(shippingZones.position), asc(shippingZones.id)),
		db
			.select({
				zoneId: shippingZoneTranslations.zoneId,
				locale: shippingZoneTranslations.locale,
				name: shippingZoneTranslations.name,
			})
			.from(shippingZoneTranslations)
			.innerJoin(
				shippingZones,
				eq(shippingZones.id, shippingZoneTranslations.zoneId),
			)
			.where(active),
		db
			.select({
				zoneId: shippingZoneMunicipalities.zoneId,
				municipality: shippingZoneMunicipalities.municipality,
			})
			.from(shippingZoneMunicipalities)
			.innerJoin(
				shippingZones,
				eq(shippingZones.id, shippingZoneMunicipalities.zoneId),
			)
			.where(active),
	]);
	return zones.map((zone) => ({
		...zone,
		municipalities: places
			.filter((p) => p.zoneId === zone.id)
			.map((p) => p.municipality),
		translations: texts.filter((t) => t.zoneId === zone.id),
	}));
}
