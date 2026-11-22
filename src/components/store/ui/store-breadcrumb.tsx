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
	category,
	className,
}: {
	trail: Trail;
	category?: { slug: string; name: string };
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
				{category && (
					<>
						<BreadcrumbItem>
							<BreadcrumbLink asChild>
								<Link
									to="/categories/$slug"
									params={{ slug: category.slug }}
									className="inline-flex min-h-11 items-center"
								>
									{category.name}
								</Link>
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
					</>
				)}
				<BreadcrumbItem>
					<BreadcrumbPage className="line-clamp-1">
						{trail.current.name}
					</BreadcrumbPage>
				</BreadcrumbItem>
			</BreadcrumbList>
		</Breadcrumb>
	);
}
