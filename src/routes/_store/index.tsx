import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowUpRight,
	MessageCircle,
	Package,
	ShoppingBag,
} from "lucide-react";
import { ProductCard } from "#/components/store/product-card";
import { RoutineCard } from "#/components/store/routine-card";
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
import { paymentMethodList } from "#/lib/payment";
import { catalogQuery, routinesQuery, storeQuery } from "#/lib/queries";
import { whatsappLink } from "#/lib/whatsapp";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

export const Route = createFileRoute("/_store/")({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(catalogQuery(getLocale())),
			context.queryClient.ensureQueryData(routinesQuery(getLocale())),
		]),
	component: Home,
});

const FEATURED_LIMIT = 8;

function Home() {
	const locale = getLocale();
	const { data } = useSuspenseQuery(catalogQuery(locale));
	const { data: store } = useSuspenseQuery(storeQuery);
	const { data: allRoutines } = useSuspenseQuery(routinesQuery(locale));
	const promises = store.promises[locale];
	const routines = [...allRoutines].sort(
		(a, b) => Number(b.isFeatured) - Number(a.isFeatured),
	);
	const methods = paymentMethodList(store.paymentMethods, locale);
	const types = [
		...new Map(
			data.products.map((p) => [p.category.slug, p.category]),
		).values(),
	].sort((a, b) => a.routineStep - b.routineStep);
	const helpHref = store.whatsappNumber
		? whatsappLink(store.whatsappNumber, m.home_help_message())
		: store.business.email && `mailto:${store.business.email}`;

	return (
		<>
			{/* Licensed editorial photo in public/editorial (credits in docs/THIRD_PARTY_NOTICES.md). */}
			<Hero
				image={{
					src: "/editorial/hero-2.webp",
					width: 2400,
					height: 1350,
					alt: m.home_photo_alt(),
				}}
				mobileImage={{
					src: "/editorial/hero-2-mobile.webp",
					width: 1080,
					height: 1350,
				}}
				title={m.home_title()}
				body={m.home_lead()}
				cta={{ label: m.home_cta_shop(), href: "/products" }}
			/>

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

			{data.concerns.length > 0 && (
				<section
					id="needs"
					aria-labelledby="needs-title"
					className="container-page scroll-mt-24 py-section"
				>
					<SectionHeading
						id="needs-title"
						title={m.home_needs_title()}
						body={m.home_needs_body()}
					/>
					<ul className="mt-8 flex flex-wrap gap-2 md:mt-10 md:grid md:grid-cols-4 md:gap-0 md:border-t">
						{[
							...data.concerns.map((c) => ({
								key: c.slug,
								label: c.name,
								search: { concern: c.slug },
							})),
							{ key: "all", label: m.home_needs_all(), search: {} },
						].map((need) => (
							<li
								key={need.key}
								className="md:border-b md:not-nth-[4n]:border-r"
							>
								<Link
									to="/products"
									search={need.search}
									className="group flex min-h-11 items-center gap-2 rounded-sm border px-4 type-ui font-medium transition-colors hover:bg-foreground hover:text-background md:min-h-44 md:items-end md:justify-between md:gap-3 md:rounded-none md:border-0 md:p-7 md:type-body md:font-normal"
								>
									<span className="md:type-h3">
										<KeepHyphenated text={need.label} />
									</span>
									<ArrowUpRight
										aria-hidden
										strokeWidth={1.5}
										className="size-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 md:size-6"
									/>
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}

			{routines.length > 0 && (
				<section
					id="routines"
					aria-labelledby="routines-title"
					className="container-page scroll-mt-24 pb-section"
				>
					<SectionHeading
						id="routines-title"
						title={m.home_routines_title()}
						body={m.home_routines_body()}
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
						aria-label={m.home_routines_title()}
						className="mt-10"
					>
						<CarouselContent className="-ml-5">
							{routines.map((r) => (
								<CarouselItem
									key={r.slug}
									className="basis-[86%] pl-5 md:basis-1/2 lg:basis-1/3"
								>
									<RoutineCard routine={r} />
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

			{types.length > 1 && (
				<section
					aria-labelledby="types-title"
					className="container-page pb-section"
				>
					<SectionHeading id="types-title" title={m.home_types_title()} />
					<ul className="mt-8 flex flex-wrap gap-2">
						{types.map((type) => (
							<li key={type.slug}>
								<StoreButton
									asChild
									variant="outline"
									className="px-4 type-ui font-medium"
								>
									<Link to="/products" search={{ category: type.slug }}>
										{type.name}
									</Link>
								</StoreButton>
							</li>
						))}
					</ul>
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
					{data.products.slice(0, FEATURED_LIMIT).map((p) => (
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
								<MessageCircle aria-hidden className="size-5" />
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
						{ icon: MessageCircle, title: m.home_step_2() },
						{ icon: Package, title: m.home_step_3({ methods }) },
					]}
				/>
			</section>
		</>
	);
}

// Keeps a hyphenated word such as "blemish-prone" on one line instead of breaking after
// the hyphen.
function KeepHyphenated({ text }: { text: string }) {
	const word = /\S+-\S+/.exec(text);
	if (!word) return text;
	return (
		<>
			{text.slice(0, word.index)}
			<span className="whitespace-nowrap">{word[0]}</span>
			{text.slice(word.index + word[0].length)}
		</>
	);
}
