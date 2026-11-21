import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	NavigationMenuTrigger,
} from "#/components/ui/navigation-menu";
import { navigationQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

// flex-row: shadcn's link is a column and would pin its text to the top of the 44px.
const item =
	"inline-flex h-(--control-lg) flex-row items-center rounded-none bg-transparent px-0 py-0 type-ui font-medium underline-offset-4 hover:bg-transparent hover:underline focus:bg-transparent data-[state=open]:bg-transparent data-[state=open]:underline data-[state=open]:hover:bg-transparent data-[state=open]:focus:bg-transparent";

const entry =
	"min-h-11 justify-center rounded-none p-0 type-ui hover:bg-transparent hover:underline focus:bg-transparent";

// Phones get store-menu.tsx. The footer repeats these links, since a closed panel is not in
// the page.
export function ProductsMenu() {
	const { data: nav } = useSuspenseQuery(navigationQuery(getLocale()));
	return (
		<NavigationMenu
			viewport={false}
			aria-label={m.nav_main()}
			className="max-md:hidden"
		>
			<NavigationMenuList className="gap-7">
				<NavigationMenuItem>
					<NavigationMenuTrigger className={item}>
						{m.nav_shop()}
					</NavigationMenuTrigger>
					<NavigationMenuContent className="md:w-[46rem] md:p-0">
						<div className="grid grid-cols-3 gap-x-8 px-8 pt-6 pb-4">
							<Group title={m.shop_needs_label()}>
								{nav.concerns.map((c) => (
									<NavigationMenuLink key={c.slug} asChild className={entry}>
										<Link to="/needs/$slug" params={{ slug: c.slug }}>
											{c.name}
										</Link>
									</NavigationMenuLink>
								))}
							</Group>
							<Group title={m.home_types_title()}>
								{nav.categories.map((c) => (
									<NavigationMenuLink key={c.slug} asChild className={entry}>
										<Link to="/categories/$slug" params={{ slug: c.slug }}>
											{c.name}
										</Link>
									</NavigationMenuLink>
								))}
							</Group>
							<Group title={m.nav_brands()}>
								{nav.brands.map((b) => (
									<NavigationMenuLink key={b.slug} asChild className={entry}>
										<Link to="/brands/$slug" params={{ slug: b.slug }}>
											{b.name}
										</Link>
									</NavigationMenuLink>
								))}
							</Group>
						</div>
						<div className="border-t px-8 pb-2">
							<NavigationMenuLink asChild className={cn(entry, "items-start")}>
								<Link to="/products">{m.nav_all_products()}</Link>
							</NavigationMenuLink>
						</div>
					</NavigationMenuContent>
				</NavigationMenuItem>
				<NavigationMenuItem>
					<NavigationMenuLink asChild className={item}>
						<Link to="/routines">{m.nav_routines()}</Link>
					</NavigationMenuLink>
				</NavigationMenuItem>
				<NavigationMenuItem>
					<NavigationMenuLink asChild className={item}>
						<Link to="/company">{m.footer_company()}</Link>
					</NavigationMenuLink>
				</NavigationMenuItem>
			</NavigationMenuList>
		</NavigationMenu>
	);
}

function Group({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<p className="type-meta text-muted-foreground">{title}</p>
			<div className="mt-1 flex flex-col">{children}</div>
		</div>
	);
}
