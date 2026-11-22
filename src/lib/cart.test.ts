import { afterAll, beforeEach, describe, expect, test } from "bun:test";

const KEY = "nagomi:cart:v1";
const storage = new Map<string, string>();
let onStorage: (event: { key: string | null }) => void = () => {};
Object.assign(globalThis, {
	localStorage: {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => void storage.set(key, value),
		removeItem: (key: string) => void storage.delete(key),
	},
	window: {
		addEventListener: (_: string, handler: typeof onStorage) => {
			onStorage = handler;
		},
	},
});
// After the stubs: cart.ts registers its storage listener when it is loaded. The stubs are
// removed so other test files see the server environment (lib/api.ts checks `window`).
const { cart } = await import("./cart");
Reflect.deleteProperty(globalThis, "window");
afterAll(() => Reflect.deleteProperty(globalThis, "localStorage"));
const lines = () => JSON.parse(storage.get(KEY) ?? "null");

beforeEach(() => cart.clear());

describe("cart.add", () => {
	test("caps a new line at the units the size has left", () => {
		cart.add("A", 5, 3);
		expect(lines()).toEqual([{ sku: "A", quantity: 3 }]);
	});

	test("adds to an existing line up to the cap", () => {
		cart.add("A", 2, 5);
		cart.add("A", 4, 5);
		expect(lines()).toEqual([{ sku: "A", quantity: 5 }]);
	});

	test("does not add, or write, a sold-out size", () => {
		storage.set(KEY, "unchanged");
		cart.add("A", 1, 0);
		expect(storage.get(KEY)).toBe("unchanged");
	});
});

describe("cart.addMany", () => {
	test("adds each size under its own cap and skips the sold-out ones", () => {
		cart.addMany([
			{ sku: "A", quantity: 1, max: 2 },
			{ sku: "B", quantity: 1, max: 0 },
			{ sku: "C", quantity: 3, max: 2 },
		]);
		expect(lines()).toEqual([
			{ sku: "A", quantity: 1 },
			{ sku: "C", quantity: 2 },
		]);
	});

	test("adds to a line already in the bag", () => {
		cart.add("A", 1, 5);
		cart.addMany([{ sku: "A", quantity: 1, max: 5 }]);
		expect(lines()).toEqual([{ sku: "A", quantity: 2 }]);
	});
});

describe("cart.set", () => {
	test("clamps the quantity to the units left", () => {
		cart.add("A", 1, 5);
		cart.set("A", 9, 4);
		expect(lines()).toEqual([{ sku: "A", quantity: 4 }]);
	});

	test("does not add a size that is not in the bag", () => {
		cart.add("A", 1, 5);
		cart.set("Z", 2, 5);
		expect(lines()).toEqual([{ sku: "A", quantity: 1 }]);
	});
});

describe("cart.remove", () => {
	test("removes only that size", () => {
		cart.addMany([
			{ sku: "A", quantity: 1, max: 5 },
			{ sku: "B", quantity: 2, max: 5 },
		]);
		cart.remove("A");
		expect(lines()).toEqual([{ sku: "B", quantity: 2 }]);
	});
});

describe("another tab", () => {
	test("changing the bag is read before this tab writes again", () => {
		cart.add("A", 1, 5);
		storage.set(KEY, JSON.stringify([{ sku: "B", quantity: 2 }]));
		onStorage({ key: KEY });
		cart.add("C", 1, 5);
		expect(lines()).toEqual([
			{ sku: "B", quantity: 2 },
			{ sku: "C", quantity: 1 },
		]);
	});

	test("clearing the storage empties the bag", () => {
		cart.add("A", 1, 5);
		storage.delete(KEY);
		onStorage({ key: null });
		cart.add("C", 1, 5);
		expect(lines()).toEqual([{ sku: "C", quantity: 1 }]);
	});

	test("a change to another key is ignored", () => {
		cart.add("A", 1, 5);
		storage.set(KEY, JSON.stringify([{ sku: "B", quantity: 2 }]));
		onStorage({ key: "something-else" });
		cart.add("C", 1, 5);
		expect(lines()).toEqual([
			{ sku: "A", quantity: 1 },
			{ sku: "C", quantity: 1 },
		]);
	});
});
