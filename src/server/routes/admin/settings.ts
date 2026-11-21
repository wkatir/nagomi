import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "#/db";
import { LOCALES, now, PAYMENT_METHODS } from "#/db/schema";
import { canonicalTimeZone, isCountryCode, isCurrencyCode } from "#/lib/intl";
import { usesReturnWindow } from "#/lib/promises";
import type { AdminEnv } from "#/server/auth";
import { idParam, invalidRequest, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { untranslated } from "../../domain/locales";
import { currentPageTexts, nextPageVersion } from "../../domain/pages";
import { pageOf } from "../../domain/paging";
import { isWhatsappNumber } from "../../domain/phone";
import { getPaymentMethods, readSettings } from "../../domain/settings";
import { localeParam, optionalText } from "./catalog-inputs";

const {
	orders,
	pages,
	pageVersions,
	purchaseOrders,
	storePaymentMethods,
	storePromises,
	storePromiseTranslations,
	storeSettings,
	users,
} = schema;
const days = (max: number) => z.number().int().min(1).max(max);

const settingsFields = z.object({
	name: z.string().trim().min(1).max(80),
	currency: z.string().refine(isCurrencyCode, "Unknown ISO 4217 currency"),
	defaultLocale: z.enum(LOCALES),
	// International format without "+" or spaces, as wa.me expects.
	whatsappNumber: z
		.string()
		.regex(/^\d{8,15}$/)
		.refine(isWhatsappNumber, "Not a valid international phone number")
		.nullable(),
	legalName: optionalText(120),
	taxIdLabel: optionalText(20),
	taxId: optionalText(40),
	address: optionalText(240),
	phone: optionalText(30),
	email: z.email().nullable(),
	timeZone: z.string().transform((value, ctx) => {
		const zone = canonicalTimeZone(value);
		if (zone === null) {
			ctx.addIssue({ code: "custom", message: "Unknown IANA time zone" });
			return z.NEVER;
		}
		return zone;
	}),
	countryCode: z
		.string()
		.refine(isCountryCode, "Unknown ISO 3166-1 alpha-2 country code"),
	orderCodePrefix: z.string().regex(/^[A-Z0-9]{1,8}$/),
	maxQuantityPerLine: z.number().int().min(1).max(999),
	minShelfLifeDays: days(3650).nullable(),
	expiryWarningDays: days(3650),
	returnWindowDays: days(365).nullable(),
	foundingYear: z
		.number()
		.int()
		.min(1900)
		.refine((year) => year <= new Date().getFullYear(), "Year in the future")
		.nullable(),
});
const settingsState = settingsFields.refine(
	(s) => s.taxId === null || s.taxIdLabel !== null,
	{ message: "A tax ID needs its label", path: ["taxIdLabel"] },
);
const settingsPatch = settingsFields
	.extend({
		acceptedPaymentMethods: z
			.array(z.enum(PAYMENT_METHODS))
			.refine((x) => new Set(x).size === x.length, "Duplicate method"),
	})
	.partial();

const promiseText = z.object({
	title: z.string().trim().min(1).max(80),
	body: z.string().trim().min(1).max(300).nullable(),
});

async function publishedReturnWindowUsers(db: ReturnType<typeof getDb>) {
	const texts = await db
		.select({
			title: storePromiseTranslations.title,
			body: storePromiseTranslations.body,
		})
		.from(storePromiseTranslations)
		.innerJoin(
			storePromises,
			eq(storePromises.id, storePromiseTranslations.promiseId),
		)
		.where(eq(storePromises.isPublished, true));
	return usesReturnWindow(texts);
}

export const settingsRouter = new Hono<AdminEnv>()
	.get("/", async (c) => {
		const db = getDb();
		const [settings, acceptedPaymentMethods] = await Promise.all([
			readSettings(db),
			getPaymentMethods(db),
		]);
		return c.json({ ...settings, acceptedPaymentMethods });
	})
	.patch("/", validate("json", settingsPatch), async (c) => {
		const db = getDb();
		const { acceptedPaymentMethods, ...patch } = c.req.valid("json");
		const stored = await readSettings(db);
		const state = settingsState.safeParse({ ...stored, ...patch });
		if (!state.success) return invalidRequest(c, state.error);
		// Amounts are stored in the currency's minor unit: changing it would change them.
		if (state.data.currency !== stored.currency) {
			const [used] = await db
				.select({
					n: sql<number>`(select count(*) from ${orders}) + (select count(*) from ${purchaseOrders})`,
				})
				.from(storeSettings);
			if (!used) throw new Error("Store settings row missing");
			if (used.n > 0) return c.json({ error: "currency_locked" }, 409);
		}
		// The default locale is every text's fallback, so it must cover everything shown.
		if (state.data.defaultLocale !== stored.defaultLocale) {
			const missing = await untranslated(db, state.data.defaultLocale);
			if (missing.length > 0)
				return c.json({ error: "default_locale_untranslated", missing }, 409);
		}
		if (
			state.data.returnWindowDays === null &&
			(await publishedReturnWindowUsers(db))
		)
			return c.json({ error: "promise_requires_return_window" }, 409);
		const record = audit(db, {
			actorUserId: c.var.adminUserId,
			action: "settings.update",
			entityType: "store_settings",
			entityId: 1,
			data: { before: stored, patch: c.req.valid("json") },
		});
		const update = db
			.update(storeSettings)
			.set({ ...state.data, updatedAt: now })
			.where(eq(storeSettings.id, 1));
		if (acceptedPaymentMethods === undefined) await db.batch([update, record]);
		else if (acceptedPaymentMethods.length === 0)
			await db.batch([update, db.delete(storePaymentMethods), record]);
		else
			await db.batch([
				update,
				db.delete(storePaymentMethods),
				db
					.insert(storePaymentMethods)
					.values(acceptedPaymentMethods.map((method) => ({ method }))),
				record,
			]);
		const [settings, methods] = await Promise.all([
			readSettings(db),
			getPaymentMethods(db),
		]);
		return c.json({ ...settings, acceptedPaymentMethods: methods });
	})
	.get("/promises", async (c) => {
		const db = getDb();
		const [rows, texts] = await Promise.all([
			db
				.select()
				.from(storePromises)
				.orderBy(asc(storePromises.position), asc(storePromises.id)),
			db.select().from(storePromiseTranslations),
		]);
		return c.json(
			rows.map((p) => ({
				...p,
				translations: texts.filter((t) => t.promiseId === p.id),
			})),
		);
	})
	.patch(
		"/promises/:id",
		validate("param", idParam),
		validate("json", z.object({ isPublished: z.boolean() })),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { isPublished } = c.req.valid("json");
			const stored = await db.query.storePromises.findFirst({
				where: eq(storePromises.id, id),
			});
			if (!stored) return c.json({ error: "not_found" }, 404);
			if (isPublished) {
				const [settings, texts] = await Promise.all([
					readSettings(db),
					db
						.select()
						.from(storePromiseTranslations)
						.where(eq(storePromiseTranslations.promiseId, id)),
				]);
				if (!texts.some((t) => t.locale === settings.defaultLocale))
					return c.json({ error: "publish_requires_default_translation" }, 409);
				if (settings.returnWindowDays === null && usesReturnWindow(texts))
					return c.json({ error: "promise_requires_return_window" }, 409);
			}
			const [[row]] = await db.batch([
				db
					.update(storePromises)
					.set({ isPublished })
					.where(eq(storePromises.id, id))
					.returning(),
				audit(
					db,
					{
						actorUserId: c.var.adminUserId,
						action: "store_promise.status",
						entityType: "store_promise",
						entityId: id,
						data: {
							from: stored.isPublished ? "published" : "draft",
							to: isPublished ? "published" : "draft",
						},
					},
					db
						.select({ id: storePromises.id })
						.from(storePromises)
						.where(eq(storePromises.id, id)),
				),
			]);
			if (!row) throw new Error(`Store promise ${id} missing after update`);
			return c.json(row);
		},
	)
	.put(
		"/promises/:id/translations/:locale",
		validate("param", localeParam),
		validate("json", promiseText),
		async (c) => {
			const db = getDb();
			const { id, locale } = c.req.valid("param");
			const body = c.req.valid("json");
			const [promise, settings] = await Promise.all([
				db.query.storePromises.findFirst({ where: eq(storePromises.id, id) }),
				readSettings(db),
			]);
			if (!promise) return c.json({ error: "not_found" }, 404);
			if (
				promise.isPublished &&
				settings.returnWindowDays === null &&
				usesReturnWindow([body])
			)
				return c.json({ error: "promise_requires_return_window" }, 409);
			const [[row]] = await db.batch([
				db
					.insert(storePromiseTranslations)
					.values({ promiseId: id, locale, ...body })
					.onConflictDoUpdate({
						target: [
							storePromiseTranslations.promiseId,
							storePromiseTranslations.locale,
						],
						set: body,
					})
					.returning(),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "store_promise.update",
					entityType: "store_promise",
					entityId: id,
					data: { locale, ...body },
				}),
			]);
			return c.json(row);
		},
	)
	.get("/pages", async (c) => {
		const db = getDb();
		const [rows, texts] = await Promise.all([
			db.select().from(pages).orderBy(asc(pages.slug)),
			currentPageTexts(db),
		]);
		return c.json(
			rows.map((p) => ({
				...p,
				translations: texts.filter((t) => t.pageId === p.id),
			})),
		);
	})
	// `author` is null for the versions the seed wrote.
	.get(
		"/pages/:id/versions",
		validate("param", idParam),
		validate(
			"query",
			z.object({
				locale: z.enum(LOCALES),
				cursor: z.coerce.number().int().positive().optional(),
				limit: z.coerce.number().int().min(1).max(50).default(20),
			}),
		),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { locale, cursor, limit } = c.req.valid("query");
			const page = await db.query.pages.findFirst({ where: eq(pages.id, id) });
			if (!page) return c.json({ error: "not_found" }, 404);
			const rows = await db
				.select({
					id: pageVersions.id,
					version: pageVersions.version,
					title: pageVersions.title,
					bodyMarkdown: pageVersions.bodyMarkdown,
					createdAt: pageVersions.createdAt,
					author: users.name,
				})
				.from(pageVersions)
				.leftJoin(users, eq(users.id, pageVersions.createdBy))
				.where(
					and(
						eq(pageVersions.pageId, id),
						eq(pageVersions.locale, locale),
						cursor ? lt(pageVersions.id, cursor) : undefined,
					),
				)
				.orderBy(desc(pageVersions.id))
				.limit(limit + 1);
			const { page: items, nextCursor } = pageOf(rows, limit);
			return c.json({ items, nextCursor });
		},
	)
	.put(
		"/pages/:id/translations/:locale",
		validate(
			"param",
			z.object({
				id: z.coerce.number().int().positive(),
				locale: z.enum(LOCALES),
			}),
		),
		validate(
			"json",
			z.object({
				title: z.string().trim().min(1).max(120),
				bodyMarkdown: z.string().trim().min(1).max(20000),
			}),
		),
		async (c) => {
			const db = getDb();
			const { id, locale } = c.req.valid("param");
			const body = c.req.valid("json");
			const page = await db.query.pages.findFirst({ where: eq(pages.id, id) });
			if (!page) return c.json({ error: "not_found" }, 404);
			await db.batch([
				db.update(pages).set({ updatedAt: now }).where(eq(pages.id, id)),
				// Consents point at the exact text: every save is a new version.
				nextPageVersion(db, { pageId: id, locale, ...body }, c.var.adminUserId),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "page.update",
					entityType: "page",
					entityId: id,
					data: { locale, title: body.title },
				}),
			]);
			return c.json({ ok: true });
		},
	);
