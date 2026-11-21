import { describe, expect, test } from "bun:test";
import {
	type InfiniteData,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { textOf } from "#/components/admin/test-markup";
import { formatInstant } from "#/lib/dates";
import { intlLocale } from "#/lib/intl";
import { AUDIT_VERBS, type AuditListSearch } from "#/lib/schemas/audit";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";
import { AuditEventDetails } from "./audit-event-dialog";
import { AuditFeed } from "./audit-feed";
import { auditVerbLabel, entityOptions } from "./labels";
import { type AuditEvent, auditActorsQuery, auditFeedQuery } from "./queries";

const event = (id: number, own: Partial<AuditEvent> = {}): AuditEvent => ({
	id,
	action: "order.status",
	entityType: "order",
	entityId: String(id * 10),
	data: { from: "pending", to: "confirmed" },
	createdAt: "2026-10-24T16:30:00Z",
	actorUserId: "ana",
	actorName: "Ana Admin",
	actorEmail: "ana@example.com",
	...own,
});

type Page = InfiniteData<{ items: AuditEvent[]; nextCursor: number | null }>;
const feed = (items: AuditEvent[], nextCursor: number | null): Page => ({
	pages: [{ items, nextCursor }],
	pageParams: [undefined],
});

function render(page: Page, search: AuditListSearch = {}) {
	const client = new QueryClient();
	client.setQueryData(["store"], {
		currency: "USD",
		countryCode: "SV",
		timeZone: "America/El_Salvador",
	});
	client.setQueryData(auditFeedQuery(search).queryKey, page);
	client.setQueryData(auditActorsQuery.queryKey, [
		{ id: "ana", name: "Ana Admin", email: "ana@example.com" },
		{ id: "beto", name: "Beto Admin", email: "beto@example.com" },
	]);
	return renderToStaticMarkup(
		<QueryClientProvider client={client}>
			<AuditFeed search={search} onSearchChange={() => {}} />
		</QueryClientProvider>,
	);
}

const when = formatInstant(
	"2026-10-24T16:30:00Z",
	intlLocale(getLocale(), "SV"),
	"America/El_Salvador",
	{ dateStyle: "medium", timeStyle: "short" },
);

describe("AuditFeed", () => {
	test("lists each event with its record, its action, who did it and when", () => {
		const html = render(
			feed(
				[
					event(2, {
						entityType: "purchase_order",
						action: "purchase_order.create",
					}),
					event(1, { actorName: null, actorEmail: null, actorUserId: "gone" }),
				],
				null,
			),
		);
		const list = html.slice(html.indexOf("<ul"));
		expect(
			[...list.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map(([, item]) =>
				textOf(item ?? ""),
			),
		).toEqual([
			`${m.admin_audit_entity_purchase_order()} #20 | ${m.admin_audit_verb_create()} | ${m.admin_audit_by({ name: "Ana Admin" })} | ${when}`,
			`${m.admin_audit_entity_order()} #10 | ${m.admin_audit_verb_status()} | ${m.admin_audit_by({ name: m.admin_audit_actor_unknown() })} | ${when}`,
		]);
	});

	test("offers more when there is a next page, and says it is the end when there is not", () => {
		const more = render(feed([event(2), event(1)], 1));
		expect(more).toContain(m.admin_audit_more());
		expect(more).not.toContain(m.admin_audit_end());
		const end = render(feed([event(2), event(1)], null));
		expect(end).toContain(m.admin_audit_end());
		expect(end).not.toContain(m.admin_audit_more());
	});

	test("an empty log says nothing happened yet", () => {
		const html = render(feed([], null));
		expect(html).toContain(m.admin_audit_empty());
		expect(html).toContain(m.admin_audit_empty_hint());
		expect(html).not.toContain(m.admin_table_no_results());
		expect(html).not.toContain(m.admin_audit_end());
		expect(html).not.toContain(m.admin_table_clear_filters());
	});

	test("filters with no match offer to clear them", () => {
		const html = render(feed([], null), { entityType: "order" });
		expect(html).toContain(m.admin_table_no_results());
		expect(html).not.toContain(m.admin_audit_empty());
		// The button in the toolbar and the one in the empty state.
		expect(html.split(m.admin_table_clear_filters()).length - 1).toBe(2);
	});

	test("filters by record type, action, person and days, with the people by name", () => {
		const html = render(feed([event(1)], null));
		const options = (label: string) => {
			const select = new RegExp(
				`<select[^>]*aria-label="${label}"[^>]*>(.*?)</select>`,
				"s",
			).exec(html);
			return textOf(select?.[1] ?? "");
		};
		expect(options(m.admin_audit_filter_entity())).toBe(
			[
				m.admin_audit_filter_entity_all(),
				...entityOptions().map((option) => option.label),
			].join(" | "),
		);
		expect(options(m.admin_audit_filter_verb())).toBe(
			[
				m.admin_audit_filter_verb_all(),
				...AUDIT_VERBS.map((verb) => auditVerbLabel[verb]()),
			].join(" | "),
		);
		expect(options(m.admin_audit_filter_actor())).toBe(
			`${m.admin_audit_filter_actor_all()} | Ana Admin | Beto Admin`,
		);
		expect(html).toContain(m.admin_filter_dates());
		expect(html).not.toContain(m.admin_table_clear_filters());
	});

	test("with a filter on, the toolbar offers to clear it", () => {
		const html = render(feed([event(1)], null), { actor: "ana" });
		expect(html).toContain(m.admin_table_clear_filters());
	});
});

describe("AuditEventDetails", () => {
	const details = (e: AuditEvent) =>
		renderToStaticMarkup(
			<QueryClientProvider client={clientWithStore()}>
				<AuditEventDetails event={e} />
			</QueryClientProvider>,
		);

	test("says what was done, by whom and when, and prints the data", () => {
		const html = details(event(1));
		expect(html).toContain(
			`<dd>${m.admin_audit_verb_status()}<span class="ml-2 type-meta text-muted-foreground">order.status</span></dd>`,
		);
		expect(html).toContain("Ana Admin");
		expect(html).toContain("ana@example.com");
		expect(html).toContain(
			formatInstant(
				"2026-10-24T16:30:00Z",
				intlLocale(getLocale(), "SV"),
				"America/El_Salvador",
				{ dateStyle: "long", timeStyle: "medium" },
			),
		);
		const pre = /<pre[^>]*>(.*?)<\/pre>/s.exec(html);
		expect(pre?.[1]).toBe(
			"{\n  &quot;from&quot;: &quot;pending&quot;,\n  &quot;to&quot;: &quot;confirmed&quot;\n}",
		);
	});

	test("an event without data says so, and a user that is gone is unknown", () => {
		const html = details(
			event(1, { data: null, actorName: null, actorEmail: null }),
		);
		expect(html).toContain(m.admin_audit_no_data());
		expect(html).not.toContain("<pre");
		expect(html).toContain(m.admin_audit_actor_unknown());
	});
});

function clientWithStore() {
	const client = new QueryClient();
	client.setQueryData(["store"], {
		currency: "USD",
		countryCode: "SV",
		timeZone: "America/El_Salvador",
	});
	return client;
}
