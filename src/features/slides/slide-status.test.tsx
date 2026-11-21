import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { SlideStatusBadge } from "./slide-status";

const slide = (
	status: "draft" | "published" | "archived",
	startsOn: string | null = null,
	endsOn: string | null = null,
) => ({ status, startsOn, endsOn });

const badge = (value: ReturnType<typeof slide>) => {
	const client = new QueryClient();
	client.setQueryData<unknown>(storeQuery.queryKey, {
		timeZone: "America/El_Salvador",
	});
	return renderToStaticMarkup(
		<QueryClientProvider client={client}>
			<SlideStatusBadge slide={value} />
		</QueryClientProvider>,
	);
};

describe("SlideStatusBadge", () => {
	test("names the status of a draft and of an archived slide", () => {
		expect(badge(slide("draft"))).toContain(m.admin_slide_status_draft());
		expect(badge(slide("archived"))).toContain(m.admin_slide_status_archived());
	});

	test("a published slide inside its dates is published", () => {
		const html = badge(slide("published", "2000-01-01", "2999-12-31"));
		expect(html).toContain(m.admin_slide_status_published());
		expect(html).toContain('data-variant="default"');
	});

	test("a published slide before its dates is scheduled, after them it ended", () => {
		expect(badge(slide("published", "2999-01-01"))).toContain(
			m.admin_slide_status_scheduled(),
		);
		expect(badge(slide("published", null, "2000-01-01"))).toContain(
			m.admin_slide_status_ended(),
		);
	});
});
