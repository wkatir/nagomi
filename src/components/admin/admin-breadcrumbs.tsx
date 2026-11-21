import { Link, useMatches } from "@tanstack/react-router";
import { Fragment } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "#/components/ui/breadcrumb";
import type { LoaderCrumb } from "#/lib/route-data";
import { m } from "#/paraglide/messages";

const crumbOfLoader = (data: unknown) =>
	typeof data === "object" && data !== null && "crumb" in data
		? (data as LoaderCrumb).crumb
		: undefined;

export function AdminBreadcrumbs() {
	const crumbs = useMatches({
		select: (matches) =>
			matches.flatMap((match) => {
				const label =
					match.staticData.crumb?.() ?? crumbOfLoader(match.loaderData);
				return label ? [{ label, id: match.id, pathname: match.pathname }] : [];
			}),
	});
	return (
		<Breadcrumb aria-label={m.nav_breadcrumb()}>
			<BreadcrumbList>
				{crumbs.map((crumb, index) => {
					const last = index === crumbs.length - 1;
					return (
						<Fragment key={crumb.id}>
							<BreadcrumbItem className={last ? undefined : "max-md:hidden"}>
								{last ? (
									<BreadcrumbPage>{crumb.label}</BreadcrumbPage>
								) : (
									<BreadcrumbLink asChild>
										<Link to={crumb.pathname}>{crumb.label}</Link>
									</BreadcrumbLink>
								)}
							</BreadcrumbItem>
							{!last && <BreadcrumbSeparator className="max-md:hidden" />}
						</Fragment>
					);
				})}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
