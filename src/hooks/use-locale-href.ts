import { useRouterState } from "@tanstack/react-router";
import type { Locale } from "#/lib/enums";
import { localizeHref } from "#/paraglide/runtime";

// The router's path has no locale prefix (router.tsx). The hash never reaches the server,
// so it stays out of the link to keep the server and browser renders equal.
export function useLocaleHref() {
	const path = useRouterState({
		select: (s) => s.location.pathname + s.location.searchStr,
	});
	return (locale: Locale) => localizeHref(path, { locale });
}
