import { m } from "#/paraglide/messages";

export const ANCESTORS = {
	home: { path: "/", name: () => m.nav_home() },
	shop: { path: "/products", name: () => m.nav_shop() },
	routines: { path: "/routines", name: () => m.nav_routines() },
} as const;
type Ancestor = keyof typeof ANCESTORS;

// Paths are route paths without the locale.
export type Trail = {
	ancestors: Ancestor[];
	current: { name: string; path: string };
};

export const trailItems = ({ ancestors, current }: Trail) => [
	...ancestors.map((a) => ({
		name: ANCESTORS[a].name(),
		path: ANCESTORS[a].path,
	})),
	current,
];
