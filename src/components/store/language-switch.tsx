import { useRouterState } from "@tanstack/react-router";
import { m } from "#/paraglide/messages";
import { getLocale, locales, localizeHref } from "#/paraglide/runtime";
import { TextAnchor } from "./ui/text-link";

// A plain link, not a router Link: the whole page renders again in the new locale.
export function LanguageSwitch({ className }: { className?: string }) {
	// The router's path has no locale prefix (router.tsx); the hash never reaches the server,
	// so it stays out of the link to keep the server and browser renders equal.
	const path = useRouterState({
		select: (s) => s.location.pathname + s.location.searchStr,
	});
	const current = getLocale();
	const next = locales.find((l) => l !== current);
	if (!next) throw new Error(`No locale other than ${current}`);
	return (
		<TextAnchor
			variant="nav"
			href={localizeHref(path, { locale: next })}
			hrefLang={next}
			lang={next}
			className={className}
		>
			{m.language_switch()}
		</TextAnchor>
	);
}
