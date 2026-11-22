import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProductStatus } from "#/lib/enums";
import { m } from "#/paraglide/messages";
import { LifecycleHeader } from "./lifecycle-header";

// The attribute itself, since "disabled" also appears in the classes.
const DISABLED = ' disabled=""';

const html = (status: ProductStatus, missing: string[] = [], busy = false) =>
	renderToStaticMarkup(
		<LifecycleHeader
			title="Set de escritorio"
			status={status}
			missing={missing}
			busy={busy}
			onStatus={() => {}}
		/>,
	);

const button = (out: string, label: string) =>
	out.match(new RegExp(`<button[^>]*>[^<]*${label}`))?.[0];

describe("LifecycleHeader", () => {
	test("says what it is and its state", () => {
		const out = html("published");
		expect(out).toContain("Set de escritorio");
		expect(out).toContain(m.admin_merch_status_published());
	});

	test("a draft that lacks nothing can be published", () => {
		const publish = button(html("draft"), m.admin_merch_publish());
		expect(publish).toBeDefined();
		expect(publish).not.toContain(DISABLED);
	});

	test("a draft that lacks something says what, and cannot be published yet", () => {
		const out = html("draft", ["the title", "a step"]);
		expect(out).toContain(
			m.admin_merch_publish_missing({ items: "the title, a step" }),
		);
		expect(button(out, m.admin_merch_publish())).toContain(DISABLED);
	});

	test("does not wait on the publish button while another change is under way", () => {
		expect(button(html("draft", [], true), m.admin_merch_publish())).toContain(
			DISABLED,
		);
	});

	test("a published one has no publish button and says nothing is missing", () => {
		const out = html("published", ["the title"]);
		expect(button(out, m.admin_merch_publish())).toBeUndefined();
		expect(out).not.toContain(
			m.admin_merch_publish_missing({ items: "the title" }),
		);
	});

	test("an archived one is restored from the main button and has no menu", () => {
		const out = html("archived");
		expect(button(out, m.admin_merch_restore())).toBeDefined();
		expect(out).not.toContain(m.admin_merch_more_actions());
	});

	test("the other states have the menu of more actions", () => {
		expect(html("draft")).toContain(m.admin_merch_more_actions());
		expect(html("published")).toContain(m.admin_merch_more_actions());
		expect(button(html("draft"), m.admin_merch_restore())).toBeUndefined();
	});
});
