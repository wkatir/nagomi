import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Wordmark } from "#/components/brand/wordmark";
import { useMoney } from "#/hooks/use-money";
import { paymentLabel } from "#/lib/payment";
import { navigationQuery, storeQuery } from "#/lib/queries";
import { sellerDetails } from "#/lib/seller";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";
import { CartButton, CartDrawer } from "./cart-drawer";
import { CookieNotice } from "./cookie-notice";
import { HeaderSearch } from "./header-search";
import { LanguageSwitch } from "./language-switch";
import { ProductsMenu } from "./products-menu";
import { StoreMenu } from "./store-menu";
import { TextAnchor, TextLink } from "./ui/text-link";

const SOCIAL = [
	{ key: "discord", label: "Discord" },
	{ key: "instagram", label: "Instagram" },
	{ key: "tiktok", label: "TikTok" },
	{ key: "youtube", label: "YouTube" },
] as const;

// Shared by the store layout and its 404, which replaces the layout (routes/_store/route.tsx).
export function StoreFrame({ children }: { children: React.ReactNode }) {
	const { data: store } = useSuspenseQuery(storeQuery);
	const { data: nav } = useSuspenseQuery(navigationQuery(getLocale()));
	const money = useMoney();
	const seller = sellerDetails(store.business);
	const { email } = store.business;
	const locale = getLocale();
	const socialLinks = SOCIAL.flatMap(({ key, label }) => {
		const href = store.social[key];
		return href ? [{ key, label, href }] : [];
	});

	return (
		<>
			<a
				href="#main"
				className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
			>
				{m.skip_to_content()}
			</a>
			{store.freeShippingFrom != null && (
				<div className="surface-inverse px-4 py-2 text-center type-meta">
					{m.announcement_free_shipping({
						amount: money(store.freeShippingFrom),
					})}
				</div>
			)}
			<header className="sticky top-0 z-40 border-b bg-background">
				<div className="container-page flex h-16 items-center justify-between gap-6 max-md:h-14">
					<div className="flex items-center gap-10 max-md:gap-1">
						<StoreMenu />
						<Link to="/" className="flex h-11 items-center">
							<Wordmark
								label={store.name}
								className="text-[26px] max-md:text-[23px]"
							/>
						</Link>
						<ProductsMenu />
					</div>
					<div className="flex items-center gap-6 type-ui max-md:gap-4">
						<HeaderSearch className="w-56 max-md:hidden lg:w-72" />
						<TextLink
							variant="nav"
							to="/products"
							className="font-medium md:hidden"
						>
							{m.nav_shop()}
						</TextLink>
						{/* On phones the language switch is in the menu. */}
						<LanguageSwitch className="max-md:hidden" />
						<TextLink
							variant="nav"
							to="/account"
							className="font-medium max-md:hidden"
						>
							{m.nav_account()}
						</TextLink>
						<CartButton />
					</div>
				</div>
			</header>
			<main id="main">{children}</main>
			<CartDrawer />
			<CookieNotice />
			<footer className="surface-inverse mt-section-sm">
				<div className="container-page pt-16 pb-12 max-md:pt-12">
					<p className="max-w-[30ch] type-lead text-foreground">
						{m.footer_tagline()}
					</p>
					<p className="mt-2 type-small text-muted-foreground">
						{m.footer_line()}
					</p>
				</div>
				<div className="container-page grid grid-cols-6 gap-8 pb-12 type-small text-muted-foreground max-lg:grid-cols-3 max-md:grid-cols-2">
					<FooterColumn title={m.footer_shop()}>
						<TextLink variant="nav" to="/products">
							{m.nav_shop()}
						</TextLink>
						<TextLink variant="nav" to="/sets">
							{m.nav_bundles()}
						</TextLink>
						{nav.brands.map((b) => (
							<TextLink
								key={b.slug}
								variant="nav"
								to="/brands/$slug"
								params={{ slug: b.slug }}
							>
								{b.name}
							</TextLink>
						))}
					</FooterColumn>
					<FooterColumn title={m.footer_types()}>
						{nav.categories.map((c) => (
							<TextLink
								key={c.slug}
								variant="nav"
								to="/categories/$slug"
								params={{ slug: c.slug }}
							>
								{c.name}
							</TextLink>
						))}
					</FooterColumn>
					<FooterColumn title={m.footer_help()}>
						{store.footerPages.map((page) => (
							<TextLink
								key={page.slug}
								variant="nav"
								to="/pages/$slug"
								params={{ slug: page.slug }}
							>
								{page.titles[locale] ?? page.titles[store.defaultLocale]}
							</TextLink>
						))}
						<TextLink
							variant="nav"
							to="/pages/$slug"
							params={{ slug: "privacy" }}
						>
							{m.page_privacy()}
						</TextLink>
						<TextLink variant="nav" to="/pages/$slug" params={{ slug: "faq" }}>
							{m.page_faq()}
						</TextLink>
					</FooterColumn>
					{store.paymentMethods.length > 0 && (
						<FooterColumn title={m.footer_payments()}>
							{store.paymentMethods.map((method) => (
								<span key={method}>{paymentLabel[method]()}</span>
							))}
						</FooterColumn>
					)}
					{socialLinks.length > 0 && (
						<FooterColumn title={m.footer_social()}>
							{socialLinks.map((link) => (
								<TextAnchor
									key={link.key}
									variant="nav"
									href={link.href}
									target="_blank"
									rel="noopener noreferrer"
								>
									{link.label}
								</TextAnchor>
							))}
						</FooterColumn>
					)}
					{(email || store.whatsappNumber) && (
						<FooterColumn title={m.footer_contact()}>
							{email && (
								<TextAnchor
									variant="nav"
									href={`mailto:${email}`}
									className="wrap-anywhere"
								>
									{email}
								</TextAnchor>
							)}
							{store.whatsappNumber && store.whatsappDisplay && (
								<TextAnchor
									variant="nav"
									href={`https://wa.me/${store.whatsappNumber}`}
									target="_blank"
									rel="noreferrer"
								>
									{m.footer_whatsapp({ number: store.whatsappDisplay })}
								</TextAnchor>
							)}
						</FooterColumn>
					)}
				</div>
				{/* The seller's identity and the certification statement belong on every page,
				home included (consumer law, LPC Art. 21-A b and c). */}
				<div className="container-page grid gap-1 border-t border-inverse-border py-6 type-meta text-muted-foreground">
					{seller.length > 0 && <p>{seller.join(" · ")}</p>}
					<p>{m.footer_security()}</p>
				</div>
				<div className="container-page overflow-hidden pb-6">
					<Wordmark
						label={store.name}
						className="text-[clamp(4.5rem,20vw,19rem)] text-foreground"
					/>
				</div>
			</footer>
		</>
	);
}

// 44px rows so every footer link is a full touch target; the payment methods keep the rhythm.
function FooterColumn({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="grid content-start">
			<p className="font-medium text-foreground">{title}</p>
			<div className="grid *:flex *:min-h-11 *:items-center">{children}</div>
		</div>
	);
}
