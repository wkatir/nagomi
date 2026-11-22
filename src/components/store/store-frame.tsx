import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Heart, UserRound } from "lucide-react";
import { Logo } from "#/components/brand/wordmark";
import { Toaster } from "#/components/ui/sonner";
import { authClient } from "#/lib/auth-client";
import { storeQuery } from "#/lib/queries";
import { sellerDetails } from "#/lib/seller";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";
import { CartButton, CartDrawer } from "./cart-drawer";
import { CookieNotice } from "./cookie-notice";
import { DemoBar } from "./demo-notice";
import { HeaderSearch } from "./header-search";
import { LanguageSwitch } from "./language-switch";
import { SOCIAL_NETWORKS } from "./social-icons";
import { StoreMenu } from "./store-menu";
import { StoreNav, StoreTrust } from "./store-nav";
import { StoreIconButton } from "./ui/store-button";
import { TextLink } from "./ui/text-link";

const SIDEBAR_IMAGE = {
	src: "/media/357a122e04db8545d20bdb2031ba4394ef64ce755837118f4f938c9272d92fd2.webp",
	width: 600,
	height: 1200,
};

export function StoreFrame({ children }: { children: React.ReactNode }) {
	const { data: store } = useSuspenseQuery(storeQuery);

	return (
		<>
			<a
				href="#main"
				className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
			>
				{m.skip_to_content()}
			</a>
			<DemoBar />
			<header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
				<div className="flex h-(--header-height) items-center gap-3 px-4 md:px-6 lg:gap-10 lg:px-11">
					<StoreMenu storeName={store.name} />
					<Link
						to="/"
						className="flex shrink-0 items-center rounded-lg"
						aria-label={m.nav_home()}
					>
						<Logo label={store.name} className="h-10 lg:h-14" />
					</Link>
					<HeaderSearch className="mx-auto w-full max-w-[40.5rem] flex-1 max-lg:hidden" />
					<div className="ml-auto flex items-center gap-1 lg:ml-0 lg:gap-4">
						<HeaderAccount />
						<StoreIconButton asChild className="max-sm:hidden">
							<Link
								to="/account/wishlist"
								aria-label={m.nav_wishlist()}
								title={m.nav_wishlist()}
							>
								<Heart aria-hidden className="size-6" />
							</Link>
						</StoreIconButton>
						<CartButton />
					</div>
				</div>
			</header>
			<div className="border-b px-4 py-3 md:px-6 lg:hidden">
				<HeaderSearch />
			</div>
			<div className="flex">
				<aside className="relative w-[13.25rem] shrink-0 border-r max-lg:hidden">
					<div className="sticky top-(--header-height) flex h-[calc(100dvh-var(--header-height))] min-h-[30rem] flex-col overflow-hidden">
						<img
							src={SIDEBAR_IMAGE.src}
							alt=""
							width={SIDEBAR_IMAGE.width}
							height={SIDEBAR_IMAGE.height}
							loading="lazy"
							decoding="async"
							className="pointer-events-none absolute inset-x-0 bottom-0 h-auto w-full opacity-80 [mask-image:linear-gradient(to_bottom,transparent_0%,black_45%)]"
						/>
						<div className="relative px-4 pt-5">
							<StoreNav />
							<div className="mx-1 my-5 border-t" />
							<StoreTrust className="pr-1 pl-3" />
						</div>
					</div>
				</aside>
				<main id="main" className="min-w-0 flex-1 pb-section">
					{children}
				</main>
			</div>
			<StoreFooter />
			<CartDrawer />
			<CookieNotice />
			<Toaster theme="dark" position="bottom-center" />
		</>
	);
}

function HeaderAccount() {
	const session = authClient.useSession();
	const user = session.data?.user;
	const signedIn = user?.role === "customer";
	const firstName = user?.name.split(" ")[0];
	return (
		<Link
			to={signedIn ? "/account" : "/account/sign-in"}
			className="flex min-h-11 items-center gap-3 rounded-full px-2 hover:bg-accent/60 lg:pr-3"
		>
			<UserRound aria-hidden className="size-6 shrink-0" />
			<span className="type-meta leading-snug max-lg:sr-only">
				<span className="block text-foreground">
					{signedIn ? firstName : m.store_sign_in()}
				</span>
				<span className="block text-foreground-secondary">
					{signedIn ? m.nav_account() : m.store_create_account()}
				</span>
			</span>
		</Link>
	);
}

function StoreFooter() {
	const { data: store } = useSuspenseQuery(storeQuery);
	const locale = getLocale();
	const seller = sellerDetails(store);
	const year = new Intl.DateTimeFormat("en", {
		year: "numeric",
		timeZone: store.timeZone,
	}).format(new Date());
	const social = SOCIAL_NETWORKS.flatMap((network) => {
		const href = store.social[network.key];
		return href ? [{ ...network, href }] : [];
	});
	return (
		<footer className="border-t">
			<div className="flex flex-wrap items-center gap-x-10 gap-y-6 px-4 py-6 md:px-6 lg:px-11">
				<Link to="/" className="shrink-0 rounded-lg" aria-label={m.nav_home()}>
					<Logo label={store.name} className="h-11" />
				</Link>
				<nav
					aria-label={m.store_footer_nav()}
					className="flex flex-1 flex-wrap justify-center gap-x-10 type-meta max-md:order-last max-md:basis-full max-md:justify-start max-md:gap-x-6"
				>
					{store.footerPages.map((page) => (
						<TextLink
							key={page.slug}
							variant="nav"
							to="/pages/$slug"
							params={{ slug: page.slug }}
							className="text-foreground-secondary hover:text-foreground"
						>
							{page.titles[locale] ?? page.titles[store.defaultLocale]}
						</TextLink>
					))}
				</nav>
				{social.length > 0 && (
					<ul className="ml-auto flex items-center gap-1 md:ml-0">
						{social.map(({ key, label, href, Icon }) => (
							<li key={key}>
								<StoreIconButton asChild className="size-10">
									<a
										href={href}
										target="_blank"
										rel="noopener noreferrer"
										aria-label={m.store_social_label({
											store: store.name,
											network: label,
										})}
									>
										<Icon aria-hidden className="size-[1.125rem]" />
									</a>
								</StoreIconButton>
							</li>
						))}
					</ul>
				)}
			</div>
			<div className="grid gap-3 border-t px-4 py-4 type-meta text-muted-foreground md:px-6 lg:px-11">
				<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
					<p>{m.store_footer_rights({ year, store: store.name })}</p>
					<p>
						{m.footer_line()}{" "}
						<span lang="ja" className="ml-1 font-serif">
							なごみ
						</span>
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-x-5 gap-y-1">
					{seller.length > 0 && <p>{seller.join(" · ")}</p>}
					<TextLink
						variant="nav"
						to="/pages/$slug"
						params={{ slug: "privacy" }}
						className="min-h-6"
					>
						{m.page_privacy()}
					</TextLink>
					<TextLink
						variant="nav"
						to="/pages/$slug"
						params={{ slug: "faq" }}
						className="min-h-6"
					>
						{m.page_faq()}
					</TextLink>
					<LanguageSwitch className="min-h-6" />
				</div>
				<p>{m.footer_security()}</p>
			</div>
		</footer>
	);
}
