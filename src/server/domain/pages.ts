import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import type { Locale } from "#/db/schema";
import { CHECKOUT_PAGES, type CheckoutPage } from "./consents";
import { qualified } from "./d1";

const { pages, pageVersions } = schema;

export async function checkoutPageVersions(
	db: Db,
	locale: Locale,
	fallback: Locale,
): Promise<
	| { ok: true; versions: Record<CheckoutPage, number> }
	| { ok: false; missing: string[] }
> {
	const rows = await db
		.select({
			slug: pages.slug,
			locale: pageVersions.locale,
			id: pageVersions.id,
		})
		.from(pageVersions)
		.innerJoin(pages, eq(pages.id, pageVersions.pageId))
		.where(eq(pages.isPublished, true))
		.orderBy(desc(pageVersions.version));
	const pick = (slug: string) =>
		(
			rows.find((r) => r.slug === slug && r.locale === locale) ??
			rows.find((r) => r.slug === slug && r.locale === fallback)
		)?.id;
	const found = CHECKOUT_PAGES.map((slug) => [slug, pick(slug)] as const);
	const missing = found.filter(([, id]) => id === undefined).map(([s]) => s);
	if (missing.length > 0)
		return { ok: false, missing: missing.map((s) => `page:${s}`) };
	return {
		ok: true,
		versions: Object.fromEntries(found) as Record<CheckoutPage, number>,
	};
}

export async function currentPageTexts(db: Db, pageId?: number) {
	const rows = await db
		.select({
			pageId: pageVersions.pageId,
			locale: pageVersions.locale,
			version: pageVersions.version,
			title: pageVersions.title,
			bodyMarkdown: pageVersions.bodyMarkdown,
			createdAt: pageVersions.createdAt,
		})
		.from(pageVersions)
		.where(pageId === undefined ? undefined : eq(pageVersions.pageId, pageId))
		.orderBy(desc(pageVersions.version));
	// Newest first, so the first row of a (page, locale) is its current text.
	const seen = new Set<string>();
	return rows.filter((r) => {
		const key = `${r.pageId}:${r.locale}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export const nextPageVersion = (
	db: Db,
	page: { pageId: number; locale: Locale; title: string; bodyMarkdown: string },
	actor: string | null,
) =>
	db.insert(pageVersions).values({
		...page,
		version: sql<number>`(select coalesce(max(${pageVersions.version}), 0) + 1 from ${pageVersions} where ${qualified(pageVersions.pageId)} = ${page.pageId} and ${qualified(pageVersions.locale)} = ${page.locale})`,
		createdBy: actor,
	});

export async function publishedPageTitles(db: Db, locale: Locale) {
	const rows = await db
		.select({ slug: pages.slug, title: pageVersions.title })
		.from(pageVersions)
		.innerJoin(pages, eq(pages.id, pageVersions.pageId))
		.where(and(eq(pages.isPublished, true), eq(pageVersions.locale, locale)))
		.orderBy(asc(pages.slug), desc(pageVersions.version));
	return rows.filter((r, i) => rows.findIndex((x) => x.slug === r.slug) === i);
}

export async function footerPages(db: Db) {
	const rows = await db
		.select({
			slug: pages.slug,
			position: pages.footerPosition,
			locale: pageVersions.locale,
			title: pageVersions.title,
			version: pageVersions.version,
		})
		.from(pages)
		.innerJoin(pageVersions, eq(pageVersions.pageId, pages.id))
		.where(and(eq(pages.isPublished, true), isNotNull(pages.footerPosition)))
		.orderBy(asc(pages.footerPosition), desc(pageVersions.version));
	const latest = rows.filter(
		(r, i) =>
			rows.findIndex((x) => x.slug === r.slug && x.locale === r.locale) === i,
	);
	return [...new Set(latest.map((r) => r.slug))].map((slug) => ({
		slug,
		titles: Object.fromEntries(
			latest.filter((r) => r.slug === slug).map((r) => [r.locale, r.title]),
		) as Partial<Record<Locale, string>>,
	}));
}
