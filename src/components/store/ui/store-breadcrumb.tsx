import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { Fragment } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "#/components/ui/breadcrumb";
import { ANCESTORS, type Trail } from "#/lib/crumbs";
import { m } from "#/paraglide/messages";

export function StoreBreadcrumb({
	trail,
	className,
}: {
	trail: Trail;
	className?: string;
}) {
	return (
		<Breadcrumb
			aria-label={m.nav_breadcrumb()}
			className={cn("type-small", className)}
		>
			<BreadcrumbList>
				{trail.ancestors.map((ancestor) => (
					<Fragment key={ancestor}>
						<BreadcrumbItem>
							<BreadcrumbLink asChild>
								<Link
									to={ANCESTORS[ancestor].path}
									className="inline-flex min-h-11 items-center"
								>
									{ANCESTORS[ancestor].name()}
								</Link>
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
					</Fragment>
				))}
				<BreadcrumbItem>
					<BreadcrumbPage>{trail.current.name}</BreadcrumbPage>
				</BreadcrumbItem>
			</BreadcrumbList>
		</Breadcrumb>
	);
}
