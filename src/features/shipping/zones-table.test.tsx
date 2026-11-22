import { describe, expect, test } from "bun:test";
import { shippingMethodLabel } from "#/components/admin/labels";
import { m } from "#/paraglide/messages";
import { renderAdmin } from "#/test/admin-render";
import { type AdminZone, zonesQuery } from "./queries";
import { zoneSearchDefaults } from "./search";
import { ZonesTable } from "./zones-table";

type Page = {
	items: AdminZone[];
	total: number;
	page: number;
	pageSize: number;
	pageCount: number;
};
const zone = (over: Partial<AdminZone> = {}): AdminZone => ({
	id: 1,
	slug: "centro",
	method: "own_delivery",
	fee: 350,
	coversRest: false,
	municipalities: ["San Salvador Centro"],
	deliveryDaysMin: 1,
	deliveryDaysMax: 3,
	position: 4,
	status: "active",
	translations: [
		{ zoneId: 1, locale: "es", name: "Centro", description: null },
		{ zoneId: 1, locale: "en", name: "Downtown", description: null },
	],
	...over,
});
const page = (items: AdminZone[]): Page => ({
	items,
	total: items.length,
	page: 1,
	pageSize: 25,
	pageCount: 1,
});

const render = (data: Page, search = zoneSearchDefaults) =>
	renderAdmin(<ZonesTable search={search} onSearchChange={() => {}} />, {
		queries: [[zonesQuery(search).queryKey, data]],
	});

describe("ZonesTable", () => {
	test("draws a row per zone: name, identifier, method, fee, coverage, delivery time and status", () => {
		const html = render(
			page([
				zone(),
				zone({
					id: 2,
					slug: "retiro",
					method: "pickup",
					fee: 0,
					coversRest: true,
					municipalities: [],
					deliveryDaysMin: 0,
					deliveryDaysMax: 0,
					position: 0,
					status: "archived",
					translations: [],
				}),
			]),
		);
		expect(html).toContain("Centro");
		expect(html).toContain(shippingMethodLabel.own_delivery());
		expect(html).toContain("$3.50");
		expect(html).toContain(m.admin_zone_days_range({ min: 1, max: 3 }));
		expect(html).toContain(m.admin_zone_status_active());
		expect(html.split(">retiro<").length - 1).toBe(2);
		expect(html).toContain(
			`aria-label="${m.admin_zone_row_actions({ name: "retiro" })}"`,
		);
		expect(html).toContain(shippingMethodLabel.pickup());
		expect(html).toContain(m.admin_zone_covers_rest());
		expect(html).toContain(m.admin_zone_municipalities_n({ count: 1 }));
		expect(html).toContain(m.admin_zone_same_day());
		expect(html).toContain(m.admin_zone_status_archived());
	});

	test("names the zone in the store's default language", () => {
		const html = renderAdmin(
			<ZonesTable search={zoneSearchDefaults} onSearchChange={() => {}} />,
			{
				defaultLocale: "en",
				queries: [[zonesQuery(zoneSearchDefaults).queryKey, page([zone()])]],
			},
		);
		expect(html).toContain("Downtown");
		expect(html).not.toContain(">Centro<");
	});

	test("each row has a menu named after the zone", () => {
		const html = render(page([zone()]));
		expect(html).toContain(
			`aria-label="${m.admin_zone_row_actions({ name: "Centro" })}"`,
		);
	});

	test("heads each column and marks the sort in use", () => {
		const html = render(page([zone()]));
		for (const label of [
			m.admin_field_name(),
			m.admin_zone_col_method(),
			m.admin_zone_col_fee(),
			m.admin_zone_col_coverage(),
			m.admin_zone_col_days(),
			m.admin_zone_col_position(),
			m.admin_col_status(),
		])
			expect(html).toContain(label);
		const sorted = /<th[^>]*aria-sort="ascending"[^>]*>.*?<\/th>/.exec(html);
		expect(sorted?.[0]).toContain(m.admin_zone_col_position());
	});

	test("has a tab per status, a filter by method and a button to create, and no search box", () => {
		const html = render(page([zone()]));
		for (const label of [
			m.admin_zone_all(),
			m.admin_zone_status_active(),
			m.admin_zone_status_archived(),
			m.admin_zone_filter_method_all(),
			m.admin_zone_new(),
		])
			expect(html).toContain(label);
		expect(html).not.toContain('type="search"');
	});

	test("an empty list offers to create the first zone; a filter with no match offers to clear", () => {
		const empty = render(page([]));
		expect(empty).toContain(m.admin_zone_empty());
		expect(empty.split(m.admin_zone_new()).length - 1).toBe(2);
		const none = render(page([]), { ...zoneSearchDefaults, method: "courier" });
		expect(none).toContain(m.admin_table_no_results());
		expect(none).toContain(m.admin_table_clear_filters());
		expect(none).not.toContain(m.admin_zone_empty());
	});
});
