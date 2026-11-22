import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "#/db";
import { SV_MUNICIPALITIES } from "#/lib/sv-locations";
import { localeQuery, validate } from "#/server/validate";
import { shippingQuote } from "../domain/cart";
import { listBundles, listCatalog, pickLocale } from "../domain/catalog";
import {
	checkoutPageVersions,
	currentPageTexts,
	footerPages,
} from "../domain/pages";
import { displayPhone } from "../domain/phone";
import { publishedPromises } from "../domain/promises";
import {
	getPaymentMethods,
	getPaymentOptions,
	getSettings,
} from "../domain/settings";
import { missingCheckoutSettings } from "../domain/store-rules";
import { catalogContext } from "../domain/storefront-catalog";
import { zoneOptions } from "../domain/zone-queries";
import { cardProvider } from "../payments/demo-card";
import type { WompiEnv } from "../payments/wompi";

const { pages } = schema;

export const storefront = new Hono()
	.get("/store", async (c) => {
		const db = getDb();
		const s = await getSettings(db);
		const [paymentMethods, paymentOptions, promises, legalPages, footer] =
			await Promise.all([
				getPaymentMethods(db),
				getPaymentOptions(db),
				publishedPromises(db, s),
				checkoutPageVersions(db, s.defaultLocale, s.defaultLocale),
				footerPages(db),
			]);
		return c.json({
			name: s.name,
			currency: s.currency,
			defaultLocale: s.defaultLocale,
			demoStore: s.demoStore,
			countryCode: s.countryCode,
			timeZone: s.timeZone,
			// Digits only, as wa.me expects.
			whatsappNumber: s.whatsappNumber,
			whatsappDisplay: s.whatsappNumber
				? displayPhone(`+${s.whatsappNumber}`)
				: null,
			freeShippingFrom: s.freeShippingFrom,
			taxRateBp: s.taxRateBp,
			paymentDueHours: s.followupPendingPaymentHours,
			lowStockThreshold: s.lowStockThreshold,
			maxQuantityPerLine: s.maxQuantityPerLine,
			returnWindowDays: s.returnWindowDays,
			checkoutOpen: missingCheckoutSettings(s).length === 0 && legalPages.ok,
			paymentMethods,
			paymentOptions,
			cardProvider: cardProvider(env as WompiEnv, s),
			promises,
			footerPages: footer,
			social: {
				discord: s.discordUrl,
				instagram: s.instagramUrl,
				tiktok: s.tiktokUrl,
				youtube: s.youtubeUrl,
			},
			business: {
				foundingYear: s.foundingYear,
				legalName: s.legalName,
				taxIdLabel: s.taxIdLabel,
				taxId: s.taxId,
				address: s.address,
				phone: s.phone,
				email: s.email,
			},
		});
	})
	.get(
		"/shipping/quote",
		validate(
			"query",
			localeQuery.extend({
				municipality: z.enum(SV_MUNICIPALITIES as [string, ...string[]]),
				merchandise: z.coerce.number().int().min(0).max(100_000_000),
			}),
		),
		async (c) => {
			const db = getDb();
			const { locale, municipality, merchandise } = c.req.valid("query");
			const settings = await getSettings(db);
			const quote = await shippingQuote(
				db,
				settings,
				locale,
				municipality,
				merchandise,
			);
			if (!quote) return c.json({ error: "no_shipping_zone" }, 404);
			const { zoneId: _, ...rest } = quote;
			return c.json({ ...rest, freeShippingFrom: settings.freeShippingFrom });
		},
	)
	.get("/shipping/zones", validate("query", localeQuery), async (c) => {
		const db = getDb();
		const { locale } = c.req.valid("query");
		const [settings, zones] = await Promise.all([
			getSettings(db),
			zoneOptions(db),
		]);
		return c.json({
			freeShippingFrom: settings.freeShippingFrom,
			zones: zones
				.filter((z) => z.method !== "pickup")
				.map((zone) => {
					const text = pickLocale(
						zone.translations,
						locale,
						settings.defaultLocale,
					);
					if (!text)
						throw new Error(
							`Shipping zone ${zone.slug} has no ${settings.defaultLocale} name`,
						);
					return {
						slug: zone.slug,
						name: text.name,
						method: zone.method,
						fee: zone.fee,
						coversRest: zone.coversRest,
						deliveryDaysMin: zone.deliveryDaysMin,
						deliveryDaysMax: zone.deliveryDaysMax,
					};
				}),
		});
	})
	.get("/catalog", validate("query", localeQuery), async (c) => {
		const db = getDb();
		const { locale } = c.req.valid("query");
		const settings = await getSettings(db);
		const context = catalogContext(settings, locale);
		const [products, bundles] = await Promise.all([
			listCatalog(db, context),
			listBundles(db, context),
		]);
		return c.json({ products, bundles });
	})
	.get("/pages/:slug", validate("query", localeQuery), async (c) => {
		const db = getDb();
		const { locale } = c.req.valid("query");
		const page = await db.query.pages.findFirst({
			where: and(
				eq(pages.slug, c.req.param("slug")),
				eq(pages.isPublished, true),
			),
		});
		if (!page) return c.json({ error: "not_found" }, 404);
		const settings = await getSettings(db);
		const texts = await currentPageTexts(db, page.id);
		const text = pickLocale(texts, locale, settings.defaultLocale);
		if (!text)
			throw new Error(
				`Published page ${page.slug} has no ${settings.defaultLocale} text`,
			);
		return c.json({
			slug: page.slug,
			title: text.title,
			bodyMarkdown: text.bodyMarkdown,
			updatedAt: page.updatedAt,
		});
	});
