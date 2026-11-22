import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Logo } from "#/components/brand/wordmark";
import { ProductCard } from "#/components/store/product-card";
import { AppPathLink } from "#/components/store/ui/app-path-link";
import { SectionHeading } from "#/components/store/ui/section-heading";
import { StoreButton } from "#/components/store/ui/store-button";
import { homeQuery, navigationQuery, storeQuery } from "#/lib/queries";
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

const FEATURED_LIMIT = 5;

const useHome = () => useSuspenseQuery(homeQuery(getLocale())).data;

type Slide = ReturnType<typeof useHome>["slides"][number];

function Home() {
	const data = useHome();
	const [hero, banner] = data.slides;
	return (
		<>
			{hero && <HomeHero slide={hero} />}
			<div className="container-page">
				<CategoryTiles />
				{data.featuredProducts.length > 0 && (
					<section aria-labelledby="featured-title" className="mt-7">
						<SectionHeading
							id="featured-title"
							title={m.home_featured_title()}
							action={{ label: m.home_see_all(), link: { to: "/products" } }}
						/>
						<ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
							{data.featuredProducts.slice(0, FEATURED_LIMIT).map((p) => (
								<li key={p.sku} className="flex">
									<ProductCard product={p} className="w-full" />
								</li>
							))}
						</ul>
					</section>
				)}
				{banner && <CombosBanner slide={banner} />}
			</div>
		</>
	);
}

function HomeHero({ slide }: { slide: Slide }) {
	const { data: store } = useSuspenseQuery(storeQuery);
	return (
		<section className="relative isolate overflow-hidden border-b max-md:pt-[48vw]">
			<img
				src={slide.image.url}
				alt={slide.image.alt}
				width={slide.image.width}
				height={slide.image.height}
				loading="eager"
				fetchPriority="high"
				decoding="sync"
				className="absolute inset-0 -z-20 size-full object-cover object-[72%_center] max-md:h-[62vw] max-md:object-[65%_center]"
			/>
			<div
				aria-hidden
				className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,#0d0d17_40%,rgb(13_13_23/0.55)_62%,rgb(13_13_23/0)_85%)] md:bg-[linear-gradient(90deg,#0d0d17_0%,rgb(13_13_23/0.92)_24%,rgb(13_13_23/0.45)_48%,rgb(13_13_23/0)_68%)]"
			/>
			<div className="flex min-h-[22.25rem] flex-col justify-center px-4 pt-6 pb-10 [--logo-h:4.75rem] md:px-8 md:py-10 md:[--logo-h:5.75rem] lg:px-11">
				<h1>
					<span className="block type-body tracking-[0.12em] text-foreground-secondary">
						{m.home_hero_welcome()}
					</span>
					<Logo
						label={store.name}
						kana={false}
						className="mt-1 h-(--logo-h) -translate-x-[0.09em]"
					/>
				</h1>
				<p className="-mt-[calc(var(--logo-h)*0.2)] ml-[calc(var(--logo-h)*1.14)] font-serif text-[1.0625rem] leading-snug md:text-xl">
					{slide.title}
				</p>
				{slide.body && (
					<p className="mt-6 max-w-[21rem] type-ui leading-relaxed text-foreground/90 md:mt-7">
						{slide.body}
					</p>
				)}
				<StoreButton asChild className="mt-6 self-start">
					<AppPathLink href={slide.linkPath}>
						{slide.ctaLabel ?? m.home_cta_shop()}
						<ArrowRight aria-hidden className="size-4" />
					</AppPathLink>
				</StoreButton>
			</div>
			<div
				aria-hidden
				className="absolute top-1/2 right-10 hidden -translate-y-1/2 flex-col items-center gap-5 md:flex"
			>
				<span
					lang="ja"
					className="font-serif text-[1.625rem] leading-none tracking-[0.3em] [writing-mode:vertical-rl]"
				>
					なごみ
				</span>
				<span className="h-12 w-px bg-foreground/70" />
				<span className="font-mono text-[0.75rem] leading-snug tracking-[0.08em] whitespace-pre-line text-foreground/85">
					{m.home_hero_aside()}
				</span>
			</div>
		</section>
	);
}

function CategoryTiles() {
	const { data: nav } = useSuspenseQuery(navigationQuery(getLocale()));
	const home = useHome();
	if (nav.categories.length === 0) return null;
	return (
		<section aria-label={m.home_types_title()} className="mt-6">
			<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 xl:grid-cols-6">
				{nav.categories.map((category) => {
					const image = home.categories.find(
						(c) => c.slug === category.slug,
					)?.image;
					return (
						<li key={category.slug}>
							<Link
								to="/categories/$slug"
								params={{ slug: category.slug }}
								className="group panel flex h-full flex-col items-center p-3 pb-3.5 text-center transition-colors hover:border-[#3a3858] hover:bg-[#18182a]"
							>
								<span className="block aspect-[16/10] w-full overflow-hidden rounded-lg bg-photo">
									{image && (
										<img
											src={image.url}
											alt=""
											width={image.width}
											height={image.height}
											loading="lazy"
											decoding="async"
											className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
										/>
									)}
								</span>
								<span className="mt-3 type-small font-medium">
									{category.name}
								</span>
								{category.subtitle && (
									<span className="mt-0.5 type-meta text-muted-foreground">
										{category.subtitle}
									</span>
								)}
							</Link>
						</li>
					);
				})}
			</ul>
		</section>
	);
}

function CombosBanner({ slide }: { slide: Slide }) {
	return (
		<section
			aria-labelledby="combos-title"
			className="panel relative isolate mt-5 overflow-hidden"
		>
			<img
				src={slide.image.url}
				alt={slide.image.alt}
				width={slide.image.width}
				height={slide.image.height}
				loading="lazy"
				decoding="async"
				className="absolute inset-y-0 right-0 -z-10 h-full w-full object-cover object-right opacity-60 md:opacity-100 [mask-image:linear-gradient(90deg,transparent_0%,black_55%)] md:w-[68%] md:[mask-image:linear-gradient(90deg,transparent_0%,black_35%)]"
			/>
			<div
				aria-hidden
				className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,#151524_25%,rgb(21_21_36/0.6)_60%,rgb(21_21_36/0)_100%)] md:hidden"
			/>
			<div className="flex min-h-[7.875rem] flex-col justify-center px-5 py-5">
				<p className="type-meta tracking-[0.08em] text-[#b4a8ff]">
					{m.home_combos_label()}
				</p>
				<h2 id="combos-title" className="mt-1 type-title">
					{slide.title}
				</h2>
				{slide.body && (
					<p className="mt-1.5 max-w-[34ch] type-small text-foreground-secondary">
						{slide.body}
					</p>
				)}
				<StoreButton asChild size="sm" className="mt-3 self-start">
					<AppPathLink href={slide.linkPath}>
						{slide.ctaLabel ?? m.nav_bundles()}
						<ArrowRight aria-hidden className="size-4" />
					</AppPathLink>
				</StoreButton>
			</div>
		</section>
	);
}
