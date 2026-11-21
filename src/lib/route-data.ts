declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		// A label that depends on data (an order's code) comes from the loader's `crumb` instead.
		crumb?: () => string;
	}
}

export type LoaderCrumb = { crumb: string };
