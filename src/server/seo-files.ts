import { getDb } from "#/db";
import type { Locale } from "#/lib/enums";
import { intlLocale } from "#/lib/intl";
import { formatMoney } from "#/lib/money";
import { paymentLabel } from "#/lib/payment";
import { localizedUrl } from "#/lib/seo";
import { siteOrigin } from "#/lib/site-origin";
import { m } from "#/paraglide/messages";
import { locales } from "#/paraglide/runtime";
import { listCatalog, listRoutines } from "./domain/catalog";
import { publishedPageTitles } from "./domain/pages";
import { publishedPromises } from "./domain/promises";
import {
	llmsTxt,
	robotsTxt,
	sitemapEntries,
	sitemapXml,
} from "./domain/seo-files";
import { getPaymentMethods, getSettings } from "./domain/settings";
import { catalogContext, loadCatalog } from "./domain/storefront-catalog";

// Crawlers fetch these often; an hour keeps a new product out of the sitemap for at most that.
const CACHE_CONTROL = "public, max-age=3600";

export const SEO_FILES = new Map<string, () => Promise<Response>>([
	[
		"/robots.txt",
		async () =>
			new Response(robotsTxt(siteOrigin()), {
				headers: {
					"Content-Type": "text/plain; charset=utf-8",
					"Cache-Control": CACHE_CONTROL,
				},
			}),
	],
	[
		"/sitemap.xml",
		async () => {
			const db = getDb();
			const settings = await getSettings(db);
			const context = catalogContext(settings, settings.defaultLocale);
			return new Response(
				sitemapXml(siteOrigin(), await sitemapEntries(db, context)),
				{
					headers: {
						"Content-Type": "application/xml; charset=utf-8",
						"Cache-Control": CACHE_CONTROL,
					},
				},
			);
		},
	],
	// One per language, at the address that language uses (/llms.txt, /en/llms.txt).
	...locales.map((locale): [string, () => Promise<Response>] => [
		new URL(localizedUrl("http://localhost", "/llms.txt", locale)).pathname,
		async () =>
			new Response(await storeLlmsTxt(locale), {
				headers: {
					"Content-Type": "text/markdown; charset=utf-8",
					"Cache-Control": CACHE_CONTROL,
				},
			}),
	]),
]);

async function storeLlmsTxt(locale: Locale) {
	const db = getDb();
	const origin = siteOrigin();
	const settings = await getSettings(db);
	const opts = { locale };
	const context = catalogContext(settings, locale);
	const [products, routines, catalog, promises, pages, payments] =
		await Promise.all([
			listCatalog(db, context),
			listRoutines(db, context),
			loadCatalog(db, context),
			publishedPromises(db, settings),
			publishedPageTitles(db, locale),
			getPaymentMethods(db),
		]);
	const money = (amount: number) =>
		formatMoney(
			amount,
			settings.currency,
			intlLocale(locale, settings.countryCode),
		);
	const url = (path: string) => localizedUrl(origin, path, locale);
	const methods = new Intl.ListFormat(locale, { type: "disjunction" }).format(
		payments.map((method) => paymentLabel[method]({}, opts).toLowerCase()),
	);
	return llmsTxt({
		name: settings.name,
		summary: m.meta_description({ store: settings.name }, opts),
		sections: [
			{
				title: m.home_trust_title({}, opts),
				lines: promises[locale].map((p) =>
					p.body ? `${p.title}: ${p.body}` : p.title,
				),
			},
			{
				title: m.home_steps_title({}, opts),
				lines: [
					m.home_step_1({}, opts),
					m.home_step_2({}, opts),
					m.home_step_3({ methods }, opts),
				],
			},
			{
				title: m.nav_shop({}, opts),
				lines: products.map(
					(p) =>
						`[${p.brand} ${p.name}](${url(`/products/${p.slug}`)}): ${p.category.name}, ${money(p.price)}${p.tagline ? `. ${p.tagline}` : ""}`,
				),
			},
			{
				title: m.shop_needs_label({}, opts),
				lines: catalog.dimensions.concern.map(
					(c) => `[${c.name}](${url(`/needs/${c.slug}`)})`,
				),
			},
			{
				title: m.home_types_title({}, opts),
				lines: catalog.dimensions.category.map(
					(c) => `[${c.name}](${url(`/categories/${c.slug}`)})`,
				),
			},
			{
				title: m.nav_brands({}, opts),
				lines: catalog.dimensions.brand.map(
					(b) => `[${b.name}](${url(`/brands/${b.slug}`)})`,
				),
			},
			{
				title: m.nav_routines({}, opts),
				lines: routines.map(
					(r) =>
						`[${r.title}](${url(`/routines/${r.slug}`)}), ${money(r.products.reduce((n, p) => n + p.price, 0))}: ${r.products.map((p) => `${p.brand} ${p.name}`).join(" + ")}`,
				),
			},
			{
				title: m.footer_help({}, opts),
				lines: pages.map((p) => `[${p.title}](${url(`/pages/${p.slug}`)})`),
			},
		],
	});
}
