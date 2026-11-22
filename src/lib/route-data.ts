import { notFound } from "@tanstack/react-router";

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		// A label that depends on data (an order's code) comes from the loader's `crumb` instead.
		crumb?: () => string;
	}
}

export type LoaderCrumb = { crumb: string };

export const idParams = {
	parse: ({ id }: { id: string }) => {
		const parsed = Number(id);
		if (!Number.isInteger(parsed) || parsed < 1) throw notFound();
		return { id: parsed };
	},
	stringify: ({ id }: { id: number }) => ({ id: String(id) }),
};
