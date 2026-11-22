import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { Boxes, House } from "lucide-react";
import { categoryIcon } from "#/lib/category-icon";
import { navigationQuery, storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";
import { promiseIcon } from "./promise-icon";

const SIDEBAR_PROMISES = ["fast-shipping", "secure-payment", "warranty"];

const item =
	"flex min-h-11 items-center gap-3.5 rounded-lg px-3 type-small lg:min-h-9 text-foreground-secondary transition-colors hover:bg-accent/60 hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground";

export function StoreNav({ className }: { className?: string }) {
	const { data: nav } = useSuspenseQuery(navigationQuery(getLocale()));
	const path = useRouterState({ select: (s) => s.location.pathname });
	const current = (href: string) =>
		path === href || (href !== "/" && path.startsWith(`${href}/`))
			? "page"
			: undefined;
	return (
		<nav aria-label={m.nav_main()} className={className}>
			<ul className="grid gap-0.5">
				<li>
					<Link
						to="/"
						activeOptions={{ exact: true }}
						className={item}
						aria-current={current("/")}
					>
						<House aria-hidden className="size-5 shrink-0" />
						{m.nav_home()}
					</Link>
				</li>
				{nav.categories.map((category) => {
					const Icon = categoryIcon[category.icon];
					return (
						<li key={category.slug}>
							<Link
								to="/categories/$slug"
								params={{ slug: category.slug }}
								className={item}
								aria-current={current(`/categories/${category.slug}`)}
							>
								<Icon aria-hidden className="size-5 shrink-0" />
								{category.name}
							</Link>
						</li>
					);
				})}
				<li>
					<Link to="/sets" className={item} aria-current={current("/sets")}>
						<Boxes aria-hidden className="size-5 shrink-0" />
						{m.nav_bundles()}
					</Link>
				</li>
			</ul>
		</nav>
	);
}

export function StoreTrust({ className }: { className?: string }) {
	const { data: store } = useSuspenseQuery(storeQuery);
	const promises = store.promises[getLocale()].filter((p) =>
		SIDEBAR_PROMISES.includes(p.slug),
	);
	if (promises.length === 0) return null;
	return (
		<ul
			aria-label={m.home_trust_title()}
			className={cn(
				"grid gap-3 text-[0.6875rem] leading-tight text-foreground-secondary",
				className,
			)}
		>
			{promises
				.sort(
					(a, b) =>
						SIDEBAR_PROMISES.indexOf(a.slug) - SIDEBAR_PROMISES.indexOf(b.slug),
				)
				.map((promise) => {
					const Icon = promiseIcon(promise.slug);
					return (
						<li key={promise.slug} className="flex items-center gap-3">
							<Icon
								aria-hidden
								className="size-4 shrink-0 text-muted-foreground"
							/>
							{promise.title}
						</li>
					);
				})}
		</ul>
	);
}
