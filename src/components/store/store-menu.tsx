import { useRouter } from "@tanstack/react-router";
import { Heart, Menu, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "#/components/brand/wordmark";
import { Sheet, SheetTrigger } from "#/components/ui/sheet";
import { m } from "#/paraglide/messages";
import { LanguageSwitch } from "./language-switch";
import { StoreNav, StoreTrust } from "./store-nav";
import { StoreIconButton } from "./ui/store-button";
import { StoreSheetContent, StoreSheetHeader } from "./ui/store-sheet";
import { TextLink } from "./ui/text-link";

const accountLink =
	"flex min-h-11 items-center gap-3.5 rounded-lg px-3 type-ui text-foreground-secondary no-underline hover:bg-accent/60 hover:text-foreground";

export function StoreMenu({ storeName }: { storeName: string }) {
	const [open, setOpen] = useState(false);
	const router = useRouter();
	useEffect(
		() => router.subscribe("onBeforeNavigate", () => setOpen(false)),
		[router],
	);

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<StoreIconButton aria-label={m.nav_menu()} className="-ml-2 lg:hidden">
					<Menu aria-hidden className="size-6" />
				</StoreIconButton>
			</SheetTrigger>
			<StoreSheetContent side="left" className="sm:max-w-[320px]">
				<StoreSheetHeader
					className="h-16 px-4"
					title={<Logo label={storeName} className="h-10" />}
				/>
				<div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
					<StoreNav />
					<div className="my-4 border-t" />
					<ul className="grid gap-1">
						<li>
							<TextLink variant="nav" to="/account" className={accountLink}>
								<UserRound aria-hidden className="size-5" />
								{m.nav_account()}
							</TextLink>
						</li>
						<li>
							<TextLink
								variant="nav"
								to="/account/wishlist"
								className={accountLink}
							>
								<Heart aria-hidden className="size-5" />
								{m.nav_wishlist()}
							</TextLink>
						</li>
					</ul>
					<div className="my-4 border-t" />
					<StoreTrust className="px-3" />
				</div>
				<div className="shrink-0 border-t px-6 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
					<LanguageSwitch />
				</div>
			</StoreSheetContent>
		</Sheet>
	);
}
