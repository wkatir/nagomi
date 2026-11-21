import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LOCALES } from "#/lib/enums";
import { languageName } from "../labels";
import { LocaleTabs } from "./locale-tabs";

const html = (defaultLocale: "es" | "en", invalid: ("es" | "en")[] = []) =>
	renderToStaticMarkup(
		<LocaleTabs defaultLocale={defaultLocale} invalid={invalid}>
			{(locale) => <p>fields of {locale}</p>}
		</LocaleTabs>,
	);

test("a tab per language, the store's default first and open", () => {
	for (const defaultLocale of LOCALES) {
		const out = html(defaultLocale);
		const other = LOCALES.find((l) => l !== defaultLocale) as "es" | "en";
		expect(out.indexOf(languageName[defaultLocale]())).toBeLessThan(
			out.indexOf(languageName[other]()),
		);
		expect(out).toContain(`fields of ${defaultLocale}`);
		expect(out).not.toContain(`fields of ${other}`);
	}
});

test("a language with errors says so on its tab, and only that one", () => {
	const out = html("es", ["en"]);
	expect(out.match(/rounded-full bg-destructive/g)).toHaveLength(1);
	expect(html("es")).not.toContain("bg-destructive");
});
