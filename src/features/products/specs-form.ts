import { LOCALES, type Locale } from "#/lib/enums";
import { PRODUCT_LIMITS } from "#/lib/schemas/products";

export type SpecText = { label: string; value: string };
export type SpecRow = Record<Locale, SpecText>;

const emptyText = (): SpecText => ({ label: "", value: "" });
export const emptySpecRow = (): SpecRow => ({
	es: emptyText(),
	en: emptyText(),
});

export const specRows = (
	specs: { translations: Partial<Record<Locale, SpecText>> }[],
): SpecRow[] =>
	specs.map((spec) => ({
		es: { ...emptyText(), ...spec.translations.es },
		en: { ...emptyText(), ...spec.translations.en },
	}));

export type SpecIssue = {
	row: number;
	locale: Locale;
	reason: "required" | "too_long";
};

const isBlank = (text: SpecText) =>
	text.label.trim() === "" && text.value.trim() === "";

export function specIssues(rows: SpecRow[], defaultLocale: Locale) {
	const issues: SpecIssue[] = [];
	rows.forEach((row, index) => {
		for (const locale of LOCALES) {
			const text = row[locale];
			const needed = locale === defaultLocale || !isBlank(text);
			if (needed && (text.label.trim() === "" || text.value.trim() === ""))
				issues.push({ row: index, locale, reason: "required" });
			else if (
				text.label.trim().length > PRODUCT_LIMITS.specLabel ||
				text.value.trim().length > PRODUCT_LIMITS.specValue
			)
				issues.push({ row: index, locale, reason: "too_long" });
		}
	});
	return issues;
}

export const specsPayload = (rows: SpecRow[]) =>
	rows.map((row) => ({
		translations: Object.fromEntries(
			LOCALES.filter((locale) => !isBlank(row[locale])).map((locale) => [
				locale,
				{
					label: row[locale].label.trim(),
					value: row[locale].value.trim(),
				},
			]),
		),
	}));

export function moveRow<T>(rows: T[], from: number, to: number): T[] {
	if (to < 0 || to >= rows.length) return rows;
	const next = [...rows];
	const [row] = next.splice(from, 1);
	next.splice(to, 0, row as T);
	return next;
}
