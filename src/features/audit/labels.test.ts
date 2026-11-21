import { describe, expect, test } from "bun:test";
import { AUDIT_ENTITY_TYPES, AUDIT_VERBS } from "#/lib/schemas/audit";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";
import {
	auditEntityLabel,
	auditVerbLabel,
	entityOptions,
	entityText,
	verbText,
} from "./labels";

describe("entityText", () => {
	test("says each record type in words", () => {
		expect(entityText("order")).toBe(m.admin_audit_entity_order());
		expect(entityText("purchase_order")).toBe(
			m.admin_audit_entity_purchase_order(),
		);
	});

	test("every type has words of its own", () => {
		const words = AUDIT_ENTITY_TYPES.map((type) => entityText(type));
		expect(new Set(words).size).toBe(AUDIT_ENTITY_TYPES.length);
		for (const type of AUDIT_ENTITY_TYPES) {
			expect(words).not.toContain(type);
			expect(auditEntityLabel[type]()).not.toBe("");
		}
	});

	test("a type the log has no words for is shown as it is stored", () => {
		expect(entityText("gift_card")).toBe("gift_card");
	});
});

describe("entityOptions", () => {
	test("offers every record type, in alphabetical order of its name", () => {
		const options = entityOptions();
		expect(options.map((o) => o.value).sort()).toEqual(
			[...AUDIT_ENTITY_TYPES].sort(),
		);
		const labels = options.map((o) => o.label);
		expect(labels).toEqual(
			[...labels].sort((a, b) => a.localeCompare(b, getLocale())),
		);
		expect(options.find((o) => o.value === "order")?.label).toBe(
			m.admin_audit_entity_order(),
		);
	});
});

describe("verbText", () => {
	test("says the verb an action ends in", () => {
		expect(verbText("order.status")).toBe(m.admin_audit_verb_status());
		expect(verbText("store_settings.update")).toBe(m.admin_audit_verb_update());
		expect(verbText("brand.create")).toBe(m.admin_audit_verb_create());
		expect(verbText("brand.archive")).toBe(m.admin_audit_verb_archive());
	});

	test("every verb has words of its own", () => {
		const words = AUDIT_VERBS.map((verb) => verbText(`order.${verb}`));
		expect(new Set(words).size).toBe(AUDIT_VERBS.length);
		for (const verb of AUDIT_VERBS) expect(auditVerbLabel[verb]()).not.toBe("");
	});

	test("an action that only ends like a verb, or has none, is shown as it is stored", () => {
		expect(verbText("brand.unarchive")).toBe("brand.unarchive");
		expect(verbText("archive")).toBe("archive");
		expect(verbText("brand.restore")).toBe("brand.restore");
	});
});
