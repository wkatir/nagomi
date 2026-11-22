import { describe, expect, test } from "bun:test";
import { statusAction, statusAudit } from "./audit-actions";

test("audit actions are <entity>.create|update|archive|status", () => {
	expect(statusAction("product", "draft", undefined)).toBe("product.update");
	expect(statusAction("product", "draft", "draft")).toBe("product.update");
	expect(statusAction("product", "draft", "archived")).toBe("product.archive");
	expect(statusAction("product", "draft", "published")).toBe("product.status");
	expect(statusAction("variant", "archived", "active")).toBe("variant.status");
});

describe("statusAudit", () => {
	const base = { before: { name: "A" }, patch: { name: "B" } };

	test("records from and to when the status moves", () => {
		expect(statusAudit("bundle", 7, "draft", "published", base)).toEqual({
			action: "bundle.status",
			entityType: "bundle",
			entityId: 7,
			data: { ...base, from: "draft", to: "published" },
		});
		expect(statusAudit("bundle", 7, "published", "archived", base)).toEqual({
			action: "bundle.archive",
			entityType: "bundle",
			entityId: 7,
			data: { ...base, from: "published", to: "archived" },
		});
	});

	test("leaves the data as given when the status does not move", () => {
		for (const to of [undefined, "draft"])
			expect(statusAudit("bundle", 7, "draft", to, base)).toEqual({
				action: "bundle.update",
				entityType: "bundle",
				entityId: 7,
				data: base,
			});
	});
});
