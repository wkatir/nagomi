import { Link } from "@tanstack/react-router";
import type * as React from "react";

export function AppPathLink({
	href,
	...props
}: Omit<React.ComponentProps<"a">, "href"> & { href: string }) {
	if (!href.startsWith("/") || href.startsWith("//"))
		throw new Error(`Expected an app path, got "${href}"`);
	const url = new URL(href, "https://app.invalid");
	return (
		<Link
			to={url.pathname}
			search={Object.fromEntries(url.searchParams)}
			hash={url.hash ? url.hash.slice(1) : undefined}
			{...props}
		/>
	);
}
