import { describe, expect, test } from "bun:test";
import { carouselOrder, moveSlide } from "./order";

describe("carouselOrder", () => {
	test("keeps the slides in use in their order and puts the archived last", () => {
		const slides = [
			{ id: 1, status: "archived" },
			{ id: 2, status: "published" },
			{ id: 3, status: "archived" },
			{ id: 4, status: "draft" },
		];
		expect(carouselOrder(slides).map((s) => s.id)).toEqual([2, 4, 1, 3]);
	});
});

describe("moveSlide", () => {
	const order = [10, 20, 30, 40];

	test("moves a slide up over the one before it", () => {
		expect(moveSlide(order, 30, 20)).toEqual([10, 30, 20, 40]);
	});

	test("moves a slide down over the one after it", () => {
		expect(moveSlide(order, 20, 30)).toEqual([10, 30, 20, 40]);
	});

	test("moves a slide to the ends", () => {
		expect(moveSlide(order, 20, 10)).toEqual([20, 10, 30, 40]);
		expect(moveSlide(order, 30, 40)).toEqual([10, 20, 40, 30]);
	});

	test("jumps over the slides a tab hides", () => {
		expect(moveSlide(order, 40, 10)).toEqual([40, 10, 20, 30]);
		expect(moveSlide(order, 10, 40)).toEqual([20, 30, 40, 10]);
	});

	test("does not change the list it is given", () => {
		moveSlide(order, 30, 20);
		expect(order).toEqual([10, 20, 30, 40]);
	});

	test("refuses a slide that is not in the order", () => {
		expect(() => moveSlide(order, 99, 10)).toThrow();
		expect(() => moveSlide(order, 10, 99)).toThrow();
	});
});
