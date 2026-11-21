export const carouselOrder = <T extends { status: string }>(slides: T[]) => [
	...slides.filter((slide) => slide.status !== "archived"),
	...slides.filter((slide) => slide.status === "archived"),
];

// The neighbour is the next slide the screen shows, which may not be the next one in the
// carousel when a tab hides some.
export function moveSlide(
	order: readonly number[],
	id: number,
	neighbour: number,
): number[] {
	const from = order.indexOf(id);
	const to = order.indexOf(neighbour);
	if (from === -1 || to === -1)
		throw new Error(`Slides ${id} and ${neighbour} must both be in the order`);
	const rest = order.filter((slide) => slide !== id);
	const at = rest.indexOf(neighbour);
	rest.splice(to < from ? at : at + 1, 0, id);
	return rest;
}
