import { useSuspenseQuery } from "@tanstack/react-query";
import type { Locale } from "#/lib/enums";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import type { Slide } from "./queries";

export const slideTitle = (slide: Slide, defaultLocale: Locale) =>
	slide.translations.find((text) => text.locale === defaultLocale)?.title ??
	m.admin_slide_untitled();

export function useSlideTitle() {
	const { data: store } = useSuspenseQuery(storeQuery);
	return (slide: Slide) => slideTitle(slide, store.defaultLocale);
}
