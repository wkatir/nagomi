import { asc, eq } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import { LOCALES, type Locale } from "#/db/schema";
import { fillPromise } from "#/lib/promises";
import { pickLocale } from "./catalog";
import { inList } from "./d1";

const { storePromises, storePromiseTranslations } = schema;

export type StorePromise = { slug: string; title: string; body: string | null };

export async function publishedPromises(
	db: Db,
	settings: { defaultLocale: Locale; returnWindowDays: number | null },
): Promise<Record<Locale, StorePromise[]>> {
	const rows = await db
		.select()
		.from(storePromises)
		.where(eq(storePromises.isPublished, true))
		.orderBy(asc(storePromises.position), asc(storePromises.id));
	const texts =
		rows.length === 0
			? []
			: await db
					.select()
					.from(storePromiseTranslations)
					.where(
						inList(
							storePromiseTranslations.promiseId,
							rows.map((r) => r.id),
						),
					);
	const inLocale = (locale: Locale) =>
		rows.map((p) => {
			const text = pickLocale(
				texts.filter((t) => t.promiseId === p.id),
				locale,
				settings.defaultLocale,
			);
			if (!text)
				throw new Error(
					`Published promise ${p.slug} has no text in ${locale} or ${settings.defaultLocale}`,
				);
			return {
				slug: p.slug,
				title: fillPromise(text.title, settings.returnWindowDays),
				body:
					text.body === null
						? null
						: fillPromise(text.body, settings.returnWindowDays),
			};
		});
	return Object.fromEntries(LOCALES.map((l) => [l, inLocale(l)])) as Record<
		Locale,
		StorePromise[]
	>;
}
