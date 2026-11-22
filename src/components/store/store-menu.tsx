import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion";
import { Sheet, SheetTrigger } from "#/components/ui/sheet";
import { navigationQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";
import { HeaderSearch } from "./header-search";
import { LanguageSwitch } from "./language-switch";
import { StoreIconButton } from "./ui/store-button";
import { StoreSheetContent, StoreSheetHeader } from "./ui/store-sheet";
import { TextLink } from "./ui/text-link";

const menuLink = "flex min-h-14 type-h3";
const subLink = "flex min-h-11 type-ui";

export function StoreMenu() {
	const [open, setOpen] = useState(false);
	const router = useRouter();
	const { data: nav } = useSuspenseQuery(navigationQuery(getLocale()));
	// Any navigation, including a link to the page already open, closes the menu.
	useEffect(
		() => router.subscribe("onBeforeNavigate", () => setOpen(false)),
		[router],
	);

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<StoreIconButton
					aria-label={m.nav_menu()}
					className="-ml-2.5 md:hidden"
				>
					<Menu aria-hidden className="size-[22px]" />
				</StoreIconButton>
			</SheetTrigger>
			<StoreSheetContent side="left">
				<StoreSheetHeader title={m.nav_menu()} className="h-14 px-4" />
				<div className="min-h-0 flex-1 overflow-y-auto px-4">
					<HeaderSearch className="py-4" />
					<nav aria-label={m.nav_main()}>
						<Accordion type="single" collapsible>
							<AccordionItem value="shop" className="last:border-b">
								<AccordionTrigger className="min-h-14 items-center py-0 type-h3 hover:no-underline [&>svg]:translate-y-0">
									{m.nav_shop()}
								</AccordionTrigger>
								<AccordionContent className="pb-4">
									<TextLink
										variant="nav"
										to="/products"
										className={`${subLink} font-medium`}
									>
										{m.nav_all_products()}
									</TextLink>
									<Group title={m.home_types_title()}>
										{nav.categories.map((c) => (
											<li key={c.slug}>
												<TextLink
													variant="nav"
													to="/categories/$slug"
													params={{ slug: c.slug }}
													className={subLink}
												>
													{c.name}
												</TextLink>
											</li>
										))}
									</Group>
									<Group title={m.nav_brands()}>
										{nav.brands.map((b) => (
											<li key={b.slug}>
												<TextLink
													variant="nav"
													to="/brands/$slug"
													params={{ slug: b.slug }}
													className={subLink}
												>
													{b.name}
												</TextLink>
											</li>
										))}
									</Group>
								</AccordionContent>
							</AccordionItem>
						</Accordion>
						<ul>
							<li className="border-b">
								<TextLink variant="nav" to="/sets" className={menuLink}>
									{m.nav_bundles()}
								</TextLink>
							</li>
							<li className="border-b">
								<TextLink variant="nav" to="/account" className={menuLink}>
									{m.nav_account()}
								</TextLink>
							</li>
							<li className="border-b">
								<TextLink
									variant="nav"
									to="/pages/$slug"
									params={{ slug: "about" }}
									className={menuLink}
								>
									{m.nav_about()}
								</TextLink>
							</li>
						</ul>
					</nav>
				</div>
				<div className="shrink-0 border-t px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
					<LanguageSwitch />
				</div>
			</StoreSheetContent>
		</Sheet>
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
		<div className="mt-3">
			<p className="type-meta text-muted-foreground">{title}</p>
			<ul>{children}</ul>
		</div>
	);
}
