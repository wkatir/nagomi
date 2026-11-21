import { describe, expect, test } from "bun:test";
import type { Suggestion } from "./queries";
import { groupSuggestions } from "./reorder-groups";

type Supplier = NonNullable<Suggestion["supplier"]>;

const supplier = (id: number, name: string): Supplier => ({
	supplierId: id,
	supplier: name,
	supplierItemId: id * 10,
	supplierSku: null,
	leadTimeDays: 7,
	packSize: null,
	minOrderQuantity: null,
	source: "preferred",
});

const suggestion = (
	variantId: number,
	orderQuantity: number,
	from: Supplier | null,
): Suggestion => ({
	sku: `SKU-${variantId}`,
	brand: "Brand",
	name: `Product ${variantId}`,
	productStatus: "published",
	supplier: from,
	leadTimeSource: null,
	variantId,
	unitsSold: 0,
	weeklyUnits: [],
	daysObserved: 56,
	ratePerDay: 0,
	ratePerWeek: 0,
	onHand: 0,
	committed: 0,
	backorders: 0,
	projectedExpiringUnits: null,
	usable: 0,
	daysOfCover: null,
	stockoutOn: null,
	reorderPoint: 0,
	reorderPointSource: "variant",
	belowReorderPoint: true,
	orderUpTo: 0,
	gap: 0,
	shelfLifeCap: null,
	topUpQuantity: orderQuantity,
	suggestedQuantity: orderQuantity,
	leadTimeDays: from?.leadTimeDays ?? null,
	packSize: null,
	minOrderQuantity: null,
	orderQuantity,
	unitPrice: null,
	unitCost: null,
	unitMargin: null,
	margin: null,
	urgency: 0,
	priorityScore: null,
	reasons: [],
});

const alpha = supplier(1, "Alpha");
const beta = supplier(2, "Beta");

describe("groupSuggestions", () => {
	test("makes a group of the sizes each supplier sells, keeping the report's order within it", () => {
		const groups = groupSuggestions([
			suggestion(1, 5, alpha),
			suggestion(2, 3, beta),
			suggestion(3, 8, alpha),
		]);
		expect(groups.map((g) => g.supplier?.supplier)).toEqual(["Alpha", "Beta"]);
		expect(groups[0]?.rows.map((r) => r.variantId)).toEqual([1, 3]);
		expect(groups[1]?.rows.map((r) => r.variantId)).toEqual([2]);
	});

	test("puts the supplier of the most urgent size first", () => {
		const groups = groupSuggestions([
			suggestion(1, 5, beta),
			suggestion(2, 5, alpha),
		]);
		expect(groups.map((g) => g.supplier?.supplier)).toEqual(["Beta", "Alpha"]);
	});

	test("leaves the sizes with no supplier to the end, in a group of their own", () => {
		const groups = groupSuggestions([
			suggestion(1, 5, null),
			suggestion(2, 5, alpha),
			suggestion(3, 5, null),
		]);
		expect(groups.map((g) => g.supplier)).toEqual([alpha, null]);
		expect(groups[1]?.rows.map((r) => r.variantId)).toEqual([1, 3]);
	});

	test("leaves out what there is nothing to order of, and a supplier left with nothing", () => {
		const groups = groupSuggestions([
			suggestion(1, 0, alpha),
			suggestion(2, 4, beta),
			suggestion(3, 0, null),
		]);
		expect(groups.map((g) => g.supplier?.supplier)).toEqual(["Beta"]);
		expect(groupSuggestions([suggestion(1, 0, alpha)])).toEqual([]);
		expect(groupSuggestions([])).toEqual([]);
	});
});
