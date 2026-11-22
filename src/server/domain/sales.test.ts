import { describe, expect, test } from "bun:test";
import {
	keptTax,
	orderSale,
	type SoldLine,
	type SoldOrder,
	salesByBrand,
	salesByOrderKey,
	salesByProduct,
	salesTotals,
	splitByWeight,
} from "./sales";

const MOUSE = {
	variantId: 3,
	sku: "AKK-MOU",
	brand: "Akko",
	name: "Silent Mouse",
};
const KEYBOARD = {
	variantId: 1,
	sku: "RZR-KBD",
	brand: "Razer",
	name: "Mechanical Keyboard",
};
const LAMP = {
	variantId: 4,
	sku: "AKK-LMP",
	brand: "Akko",
	name: "Desk Lamp",
};

let nextItem = 1;
const line = (
	product: typeof MOUSE,
	quantity: number,
	unitPrice: number,
	returned: number,
	costE4: number,
	returnedCostE4 = returned * costE4,
): SoldLine => ({
	orderItemId: nextItem++,
	...product,
	quantity,
	unitPrice,
	returned,
	soldCostE4: quantity * costE4,
	returnedCostE4,
});

// Order 1: delivered, 3.00 shipping; every unit came back (one MOUSE restocked, the rest
// written off). Order 4: delivered, 3.00 shipping. Order 5: shipped with a 10.00
// discount and one of two MOUSE returned. Lot costs: MOUSE 8.00, KEYBOARD 16.0745, LAMP 11.00.
const orders: SoldOrder[] = [
	{
		id: 1,
		day: "2026-09-01",
		status: "delivered",
		subtotal: 5800,
		discount: 0,
		shipping: 300,
		total: 6100,
		taxIncluded: 702,
		lines: [
			line(MOUSE, 2, 1700, 2, 80_000),
			line(KEYBOARD, 1, 2400, 1, 160_745),
		],
	},
	{
		id: 4,
		day: "2026-09-02",
		status: "delivered",
		subtotal: 9900,
		discount: 0,
		shipping: 300,
		total: 10200,
		taxIncluded: 1173,
		lines: [
			line(MOUSE, 3, 1700, 0, 80_000),
			line(KEYBOARD, 2, 2400, 0, 160_745),
		],
	},
	{
		id: 5,
		day: "2026-09-08",
		status: "shipped",
		subtotal: 5300,
		discount: 1000,
		shipping: 0,
		total: 4300,
		taxIncluded: 495,
		lines: [line(MOUSE, 2, 1700, 1, 80_000), line(LAMP, 1, 1900, 0, 110_000)],
	},
];

describe("splitByWeight", () => {
	test("adds up exactly with the largest remainder", () => {
		expect(splitByWeight(100, [1, 1, 1])).toEqual([34, 33, 33]);
		expect(splitByWeight(10, [0, 5, 5])).toEqual([0, 5, 5]);
		expect(splitByWeight(0, [0, 0])).toEqual([0, 0]);
		expect(splitByWeight(7, [3, 1])).toEqual([5, 2]);
		expect(() => splitByWeight(1, [0])).toThrow();
	});
});

describe("orderSale", () => {
	test("a full return keeps nothing, not even shipping", () => {
		const sale = orderSale(orders[0] as SoldOrder);
		expect(sale).toMatchObject({
			revenue: 0,
			merchandise: 0,
			shipping: 0,
			costE4: 0,
		});
		expect(sale.lines.map((l) => l.units)).toEqual([0, 0]);
	});

	test("spreads the kept discount over the kept lines", () => {
		const sale = orderSale(orders[2] as SoldOrder);
		// Kept value 1700 + 1900 = 3600; discount kept = round(1000 * 3600 / 5300) = 679.
		expect(sale.revenue).toBe(3600 - 679);
		expect(sale.merchandise).toBe(2921);
		// 679 split 1700:1900 -> 320.6 / 358.4 -> 321 / 358 (largest remainder).
		expect(sale.lines.map((l) => l.merchandise)).toEqual([
			1700 - 321,
			1900 - 358,
		]);
		expect(sale.lines.map((l) => l.costE4)).toEqual([80_000, 110_000]);
	});

	test("refuses orders that are not sales", () => {
		expect(() =>
			orderSale({ ...(orders[1] as SoldOrder), status: "paid" }),
		).toThrow();
	});
});

describe("keptTax", () => {
	test("the order's IVA in proportion to what it still owes", () => {
		expect(keptTax({ total: 4300, taxIncluded: 495 }, 4300)).toBe(495);
		expect(keptTax({ total: 4300, taxIncluded: 495 }, 2921)).toBe(336);
		expect(keptTax({ total: 4300, taxIncluded: 495 }, 0)).toBe(0);
	});
});

describe("aggregates", () => {
	const sales = orders.map(orderSale);

	test("totals net of returns", () => {
		expect(salesTotals(sales)).toEqual({
			orders: 3,
			units: 5 + 2,
			// 0 + (9900 + 300) + 2921
			revenue: 13_121,
			tax: 1173 + 336,
			netRevenue: 13_121 - 1509,
			averageTicket: 4374,
			merchandise: 9900 + 2921,
			shipping: 300,
			// 3 x 8.00 + 2 x 16.0745 + 8.00 + 11.00 = 75.149 -> 75.15
			costOfGoodsSold: 7515,
			grossProfit: 12_821 - 7515,
			margin: Math.round(((12_821 - 7515) / 12_821) * 10_000) / 10_000,
		});
	});

	test("by period key", () => {
		const weeks = salesByOrderKey(sales, (s) =>
			s.day < "2026-09-07" ? "w1" : "w2",
		);
		expect(weeks.get("w1")?.merchandise).toBe(9900);
		expect(weeks.get("w2")?.merchandise).toBe(2921);
		expect(weeks.get("w2")?.costOfGoodsSold).toBe(1900);
	});

	test("by product and brand", () => {
		const products = salesByProduct(sales);
		expect(products.map((p) => [p.sku, p.units, p.merchandise])).toEqual([
			["AKK-MOU", 4, 5100 + 1379],
			["RZR-KBD", 2, 4800],
			["AKK-LMP", 1, 1542],
		]);
		const mouse = products.find((p) => p.sku === "AKK-MOU");
		expect(mouse).toMatchObject({
			orders: 3,
			unitsSold: 7,
			unitsReturned: 3,
			costOfGoodsSold: 3200,
			grossProfit: 6479 - 3200,
		});
		const brands = salesByBrand(sales);
		expect(brands.map((b) => [b.brand, b.products, b.units])).toEqual([
			["Akko", 2, 5],
			["Razer", 1, 2],
		]);
		expect(brands.reduce((n, b) => n + b.merchandise, 0)).toBe(
			salesTotals(sales).merchandise,
		);
	});
});
