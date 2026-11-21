import { createFileRoute, notFound } from "@tanstack/react-router";

// Without it an unknown address is the root route's 404, outside the store's layout.
export const Route = createFileRoute("/_store/$")({
	loader: () => {
		throw notFound();
	},
});
