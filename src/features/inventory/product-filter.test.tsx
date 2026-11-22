import { describe, expect, test } from "bun:test";
import { renderWithStore } from "#/lib/test-store";
import { m } from "#/paraglide/messages";
import { ProductFilter } from "./product-filter";

const html = (sku?: string) =>
	renderWithStore(<ProductFilter sku={sku} onChange={() => {}} />);

describe("ProductFilter", () => {
	test("asks for a product while none is chosen, and has nothing to take off", () => {
		const out = html();
		expect(out).toContain(m.admin_movement_filter_product());
		expect(out).not.toContain(m.admin_movement_clear_product());
	});

	test("shows the SKU chosen, with a way to take it off", () => {
		const out = html("CAB-050");
		expect(out).toContain("CAB-050");
		expect(out).toContain('data-active="true"');
		expect(out).toContain(m.admin_movement_clear_product());
	});
});
