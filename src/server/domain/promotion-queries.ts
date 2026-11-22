import { and, count, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import type { Locale } from "#/db/schema";
import type { PromotionListSearch } from "#/lib/schemas/promotions";
import { pickLocale } from "./catalog";
import { inList, qualified } from "./d1";
import { pageWindow, sortBy, toPaged } from "./list-query";
import type { PromotionUsage } from "./promotions";

const { promotions, promotionTranslations } = schema;

// The triggers count usage the same way.
const promotionUsage = sql<number>`(select count(*) from promotion_redemptions r where r.promotion_id = ${qualified(promotions.id)} and r.released_at is null)`;

// Released ones included: once any order used the code, its terms are fixed.
export const promotionTermsLocked =
	sql<boolean>`exists (select 1 from promotion_redemptions r where r.promotion_id = ${qualified(promotions.id)})`.mapWith(
		Boolean,
	);

const detailColumns = {
	promotion: promotions,
	usage: promotionUsage,
	termsLocked: promotionTermsLocked,
};

type DetailRow = {
	promotion: typeof promotions.$inferSelect;
	usage: number;
	termsLocked: boolean;
};

async function withTexts(db: Db, rows: DetailRow[]) {
	const texts =
		rows.length === 0
			? []
			: await db
					.select()
					.from(promotionTranslations)
					.where(
						inList(
							promotionTranslations.promotionId,
							rows.map((r) => r.promotion.id),
						),
					);
	return rows.map(({ promotion, usage, termsLocked }) => ({
		...promotion,
		usage,
		termsLocked,
		translations: texts.filter((t) => t.promotionId === promotion.id),
	}));
}

export async function promotionDetail(db: Db, id: number) {
	const rows = await db
		.select(detailColumns)
		.from(promotions)
		.where(eq(promotions.id, id));
	const [promotion] = await withTexts(db, rows);
	return promotion ?? null;
}

const sortColumns = {
	createdAt: promotions.createdAt,
	code: promotions.code,
	usage: promotionUsage,
	startsOn: promotions.startsOn,
	endsOn: promotions.endsOn,
};

export async function pagedPromotions(db: Db, query: PromotionListSearch) {
	const where = and(
		query.status ? eq(promotions.status, query.status) : undefined,
		query.q
			? sql`instr(${promotions.code}, ${query.q.toUpperCase()}) > 0`
			: undefined,
	);
	const { limit, offset } = pageWindow(query);
	const [rows, [counted]] = await db.batch([
		db
			.select(detailColumns)
			.from(promotions)
			.where(where)
			.orderBy(...sortBy(sortColumns, query.sort, query.dir, promotions.id))
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(promotions).where(where),
	]);
	return toPaged(await withTexts(db, rows), counted.total, query);
}

const customerUsage = (email: string) =>
	sql<number>`(select count(*) from promotion_redemptions r where r.promotion_id = ${qualified(promotions.id)} and r.released_at is null and r.email = ${email})`;
const priorOrders = (email: string) =>
	sql<number>`(select count(*) from orders o where o.customer_email = ${email} and o.status <> 'cancelled')`;

// `code` is already normalized, `email` lower case.
export async function promotionByCode(
	db: Db,
	code: string,
	email: string | null,
	locales: { locale: Locale; fallback: Locale },
) {
	const [[row], texts] = await db.batch([
		db
			.select({
				promotion: promotions,
				orders: promotionUsage,
				customerOrders: email ? customerUsage(email) : sql<null>`null`,
				priorOrders: email ? priorOrders(email) : sql<null>`null`,
			})
			.from(promotions)
			.where(eq(promotions.code, code)),
		db
			.select({
				locale: promotionTranslations.locale,
				description: promotionTranslations.description,
			})
			.from(promotionTranslations)
			.innerJoin(
				promotions,
				eq(promotions.id, promotionTranslations.promotionId),
			)
			.where(
				and(
					eq(promotions.code, code),
					inArray(promotionTranslations.locale, [
						locales.locale,
						locales.fallback,
					]),
				),
			),
	]);
	if (!row) return null;
	const usage: PromotionUsage = {
		orders: row.orders,
		customerOrders: row.customerOrders,
		priorOrders: row.priorOrders,
	};
	return {
		promotion: row.promotion,
		usage,
		description:
			pickLocale(texts, locales.locale, locales.fallback)?.description ?? null,
	};
}
