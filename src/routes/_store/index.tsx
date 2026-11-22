import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CreditCard, Package, ShoppingBag } from "lucide-react";
import { BundleCard } from "#/components/store/bundle-card";
import { ProductCard } from "#/components/store/product-card";
import { Hero } from "#/components/store/ui/hero";
import { InverseBand } from "#/components/store/ui/inverse-band";
import { PromiseList } from "#/components/store/ui/promise-list";
import { SectionHeading } from "#/components/store/ui/section-heading";
import { StoreButton } from "#/components/store/ui/store-button";
import { TrustList } from "#/components/store/ui/trust-list";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "#/components/ui/carousel";
import { categoryIcon } from "#/lib/category-icon";
import { paymentMethodList } from "#/lib/payment";
import { homeQuery, navigationQuery, storeQuery } from "#/lib/queries";
import { whatsappLink } from "#/lib/whatsapp";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

export const Route = createFileRoute("/_store/")({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(homeQuery(getLocale())),
			context.queryClient.ensureQueryData(navigationQuery(getLocale())),
		]),
	component: Home,
});

const FEATURED_LIMIT = 8;

function Home() {
	const locale = getLocale();
	const { data } = useSuspenseQuery(homeQuery(locale));
	const { data: nav } = useSuspenseQuery(navigationQuery(locale));
	const { data: store } = useSuspenseQuery(storeQuery);
	const promises = store.promises[locale];
	const bundles = data.featuredBundles;
	const methods = paymentMethodList(store.paymentMethods, locale);
	const [slide] = data.slides;
	const helpHref = store.whatsappNumber
		? whatsappLink(store.whatsappNumber, m.home_help_message())
		: store.business.email && `mailto:${store.business.email}`;

	return (
		<>
			{slide && (
				<Hero
					image={{
						src: slide.image.url,
						width: slide.image.width,
						height: slide.image.height,
						alt: slide.image.alt,
					}}
					mobileImage={
						slide.mobileImage && {
							src: slide.mobileImage.url,
							width: slide.mobileImage.width,
							height: slide.mobileImage.height,
						}
					}
					title={slide.title}
					body={slide.body}
					cta={{
						label: slide.ctaLabel ?? m.home_cta_shop(),
						href: slide.linkPath,
					}}
				/>
			)}

			{/* Right under the first screen instead of near the footer
			    (docs/research/2026-10-18-review/storefront-ux.md, S7). */}
			{promises.length > 0 && (
				<section aria-label={m.home_trust_title()} className="border-b">
					<PromiseList
						items={promises}
						className="container-page grid grid-cols-2 gap-x-4 gap-y-3 py-5 md:grid-cols-4 md:py-6"
					/>
				</section>
			)}

			{nav.categories.length > 0 && (
				<section
					aria-labelledby="categories-title"
					className="container-page py-section"
				>
					<SectionHeading
						id="categories-title"
						title={m.home_types_title()}
						action={{ label: m.see_all(), link: { to: "/products" } }}
					/>
					<ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
						{nav.categories.map((category) => {
							const Icon = categoryIcon[category.icon];
							return (
								<li key={category.slug}>
									<Link
										to="/categories/$slug"
										params={{ slug: category.slug }}
										className="flex h-full flex-col gap-3 border p-5 transition-colors hover:bg-muted"
									>
										<Icon aria-hidden strokeWidth={1.5} className="size-7" />
										<span className="type-ui font-medium">{category.name}</span>
										{category.subtitle && (
											<span className="type-meta text-muted-foreground">
												{category.subtitle}
											</span>
										)}
									</Link>
								</li>
							);
						})}
					</ul>
				</section>
			)}

			{bundles.length > 0 && (
				<section
					id="sets"
					aria-labelledby="bundles-title"
					className="container-page scroll-mt-24 pb-section"
				>
					<SectionHeading
						id="bundles-title"
						title={m.home_bundles_title()}
						body={m.home_bundles_body()}
						action={{ label: m.see_all(), link: { to: "/sets" } }}
					/>
					<Carousel
						opts={{
							align: "start",
							// Embla scrolls with its own script, which the global reduced-motion
							// rule cannot slow down.
							breakpoints: {
								"(prefers-reduced-motion: reduce)": { duration: 0 },
							},
						}}
						aria-label={m.home_bundles_title()}
						className="mt-10"
					>
						<CarouselContent className="-ml-5">
							{bundles.map((b) => (
								<CarouselItem
									key={b.slug}
									className="basis-[86%] pl-5 md:basis-1/2 lg:basis-1/3"
								>
									<BundleCard bundle={b} />
								</CarouselItem>
							))}
						</CarouselContent>
						<div className="mt-6 flex justify-end gap-2 max-md:hidden">
							<CarouselPrevious
								aria-label={m.ui_carousel_previous()}
								className="static size-11 translate-y-0 rounded-none"
							/>
							<CarouselNext
								aria-label={m.ui_carousel_next()}
								className="static size-11 translate-y-0 rounded-none"
							/>
						</div>
					</Carousel>
				</section>
			)}

			<section
				aria-labelledby="available-title"
				className="container-page pb-section"
			>
				<SectionHeading
					id="available-title"
					title={m.home_available()}
					action={{ label: m.see_all(), link: { to: "/products" } }}
				/>
				<div className="mt-10 grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-3 md:gap-x-5 md:gap-y-12 lg:grid-cols-4">
					{data.featuredProducts.slice(0, FEATURED_LIMIT).map((p) => (
						<ProductCard key={p.sku} product={p} />
					))}
				</div>
			</section>

			<InverseBand aria-labelledby="help-title">
				<div className="flex items-end justify-between gap-x-8 gap-y-6 max-md:flex-col max-md:items-stretch">
					<div>
						<h2 id="help-title" className="max-w-[22ch] type-h2 text-balance">
							{m.home_help_title()}
						</h2>
						<p className="mt-3 max-w-[48ch] type-lead text-foreground-secondary">
							{m.home_help_body()}
						</p>
					</div>
					{helpHref ? (
						<StoreButton asChild size="lg" className="shrink-0">
							<a
								href={helpHref}
								target={store.whatsappNumber ? "_blank" : undefined}
								rel={store.whatsappNumber ? "noopener noreferrer" : undefined}
							>
								{m.home_help_cta()}
							</a>
						</StoreButton>
					) : (
						<StoreButton asChild size="lg" className="shrink-0">
							<Link to="/pages/$slug" params={{ slug: "faq" }}>
								{m.page_faq()}
							</Link>
						</StoreButton>
					)}
				</div>
			</InverseBand>

			<section
				aria-labelledby="steps-title"
				className="container-page py-section"
			>
				<SectionHeading
					id="steps-title"
					title={m.home_steps_title()}
					action={{
						label: m.page_faq(),
						link: { to: "/pages/$slug", params: { slug: "faq" } },
					}}
				/>
				<TrustList
					className="mt-10"
					items={[
						{ icon: ShoppingBag, title: m.home_step_1() },
						{ icon: CreditCard, title: m.home_step_2() },
						{ icon: Package, title: m.home_step_3({ methods }) },
					]}
				/>
			</section>
		</>
	);
}
