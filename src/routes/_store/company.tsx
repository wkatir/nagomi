import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type * as React from "react";
import { LogoMark } from "#/components/brand/wordmark";
import { InverseBand } from "#/components/store/ui/inverse-band";
import { StoreButton } from "#/components/store/ui/store-button";
import { TextAnchor, TextLink } from "#/components/store/ui/text-link";
import { LOCALES } from "#/lib/enums";
import { storeQuery } from "#/lib/queries";
import { jsonLdMeta, localizedUrl, organizationId, pageMeta } from "#/lib/seo";
import { siteOrigin } from "#/lib/site-origin";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

// Public facts only: no plan, no single person's name (docs/strategy/VISION.md). Structure
// after Aesop's "Our story". The editorial photos are licensed (credits in
// docs/THIRD_PARTY_NOTICES.md) and never stand for customers or staff.
export const Route = createFileRoute("/_store/company")({
	loader: ({ context }) => context.queryClient.ensureQueryData(storeQuery),
	head: ({ loaderData }) => {
		if (!loaderData) return {};
		const origin = siteOrigin();
		const url = localizedUrl(origin, "/company", getLocale());
		return {
			meta: [
				...pageMeta({
					title: m.company_meta_title(),
					storeName: loaderData.name,
					description: m.company_meta_description({
						store: loaderData.name,
						country: countryName(loaderData.countryCode),
					}),
				}),
				jsonLdMeta({
					"@context": "https://schema.org",
					"@type": "AboutPage",
					url,
					name: m.company_meta_title(),
					about: { "@id": organizationId(origin) },
				}),
			],
		};
	},
	component: Company,
});

function countryName(code: string) {
	const name = new Intl.DisplayNames([getLocale()], {
		type: "region",
		fallback: "none",
	}).of(code);
	if (!name) throw new Error(`Unknown country code ${code}`);
	return name;
}

function languages() {
	const locale = getLocale();
	const names = new Intl.DisplayNames([locale], {
		type: "language",
		fallback: "none",
	});
	const list = new Intl.ListFormat(locale, { type: "conjunction" }).format(
		LOCALES.map((l) => {
			const name = names.of(l);
			if (!name) throw new Error(`Unknown language ${l}`);
			return name;
		}),
	);
	return list.charAt(0).toLocaleUpperCase(locale) + list.slice(1);
}

function Company() {
	const { data: store } = useSuspenseQuery(storeQuery);
	const country = countryName(store.countryCode);
	const { email, legalName } = store.business;
	const site = new URL(siteOrigin()).host;

	return (
		<>
			<section className="container-page grid gap-x-14 gap-y-8 py-section md:grid-cols-[7fr_5fr] md:items-end">
				<h1 className="max-w-[18ch] type-h1 text-balance">
					{m.company_title()}
				</h1>
				<div>
					<p className="max-w-[40ch] type-lead text-foreground-secondary">
						{m.company_lead({ country })}
					</p>
					<div className="mt-6 flex flex-wrap gap-3">
						<StoreButton asChild>
							<Link to="/products">{m.company_cta_products()}</Link>
						</StoreButton>
						{email && (
							<StoreButton asChild variant="outline">
								<a href="#contact">{m.company_cta_contact()}</a>
							</StoreButton>
						)}
					</div>
				</div>
			</section>

			<picture>
				<source
					media="(max-width: 767px)"
					srcSet="/editorial/hero-4-mobile.webp"
					width={1080}
					height={1350}
				/>
				<img
					src="/editorial/hero-4.webp"
					alt={m.company_photo_alt()}
					width={2400}
					height={1350}
					className="aspect-[4/5] w-full bg-photo object-cover md:aspect-[21/9]"
				/>
			</picture>

			<section aria-label={m.company_facts_title()} className="border-b">
				<dl className="container-page grid grid-cols-4 max-md:grid-cols-2">
					<Stat value={m.company_fact_founded_value()}>
						{m.company_fact_founded()}
					</Stat>
					<Stat value={country}>{m.company_strip_base()}</Stat>
					<Stat value={site}>{m.company_strip_channel()}</Stat>
					<Stat value={languages()}>{m.company_strip_languages()}</Stat>
				</dl>
			</section>

			<InverseBand aria-labelledby="why-title">
				<h2 id="why-title" className="type-h2">
					{m.company_why_title()}
				</h2>
				<div className="mt-10 grid gap-x-14 gap-y-6 md:grid-cols-[5fr_7fr] md:items-end">
					<p className="type-display leading-none tabular-nums">
						{m.company_why_numeral()}
					</p>
					<div>
						<p className="max-w-[52ch] type-lead">{m.company_gap_body()}</p>
						<TextAnchor
							href={m.company_gap_source_url()}
							target="_blank"
							rel="noreferrer"
							className="mt-5 gap-2 type-small text-muted-foreground hover:text-foreground"
						>
							{m.company_gap_source()}
							<ArrowRight aria-hidden className="size-4" />
						</TextAnchor>
					</div>
				</div>
			</InverseBand>

			<section
				aria-labelledby="today-title"
				className="container-page py-section"
			>
				<h2 id="today-title" className="type-h2">
					{m.company_today_title()}
				</h2>
				<div className="mt-12 grid gap-16 md:gap-24">
					<Story
						image={{
							src: "/editorial/editorial-1.webp",
							alt: m.company_photo_direct_alt(),
							width: 1600,
							height: 2000,
						}}
						title={m.company_today_direct_title()}
						body={m.company_today_direct_body({ country })}
						link={
							<TextLink to="/products">{m.company_link_products()}</TextLink>
						}
					/>
					<Story
						image={{
							src: "/editorial/hero-2-mobile.webp",
							alt: m.company_photo_routines_alt(),
							width: 1080,
							height: 1350,
						}}
						title={m.company_today_routines_title()}
						body={m.company_today_routines_body()}
						link={
							<TextLink to="/" hash="routines">
								{m.company_link_routines()}
							</TextLink>
						}
						flip
					/>
					<Story
						markLabel={store.name}
						title={m.company_today_service_title()}
						body={m.company_today_service_body()}
						link={
							<TextLink to="/pages/$slug" params={{ slug: "faq" }}>
								{m.page_faq()}
							</TextLink>
						}
					/>
				</div>
			</section>

			<section
				aria-labelledby="choose-title"
				className="container-page border-t py-section"
			>
				<h2 id="choose-title" className="type-h2">
					{m.company_choose_title()}
				</h2>
				<ul className="mt-10 grid border-t md:grid-cols-2">
					<Principle title={m.company_choose_need_title()}>
						{m.company_choose_need_body()}
					</Principle>
					<Principle title={m.company_choose_info_title()}>
						{m.company_choose_info_body()}
					</Principle>
					<Principle title={m.company_choose_dates_title()}>
						{m.company_choose_dates_body()}
					</Principle>
					<Principle title={m.company_choose_everyone_title()}>
						{m.company_choose_everyone_body()}
					</Principle>
				</ul>
			</section>

			<section className="container-page grid gap-12 border-t pt-16 pb-section md:grid-cols-2">
				<div>
					<h2 className="type-h2">{m.company_facts_title()}</h2>
					<dl className="mt-8 grid grid-cols-[max-content_1fr] gap-x-10 gap-y-3">
						<Fact label={m.company_fact_name()} value={store.name} />
						{legalName && (
							<Fact label={m.company_fact_legal_name()} value={legalName} />
						)}
						<Fact
							label={m.company_today_tech_title()}
							value={m.company_today_tech_body()}
						/>
					</dl>
					<h3 className="mt-10 type-h3">{m.company_resources_title()}</h3>
					<ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
						<li>
							<TextAnchor href="/logo-mark.svg" download>
								{m.company_resource_svg()}
							</TextAnchor>
						</li>
						<li>
							<TextAnchor href="/logo.png" download>
								{m.company_resource_png()}
							</TextAnchor>
						</li>
					</ul>
				</div>
				<div id="contact" className="scroll-mt-24">
					<h2 className="type-h2">{m.company_contact_title()}</h2>
					{email && (
						<>
							<p className="mt-4 max-w-[36ch] text-foreground-secondary">
								{m.company_contact_body()}
							</p>
							<TextAnchor href={`mailto:${email}`} className="mt-4 type-h3">
								{email}
							</TextAnchor>
						</>
					)}
					<p className="mt-8 max-w-[36ch] text-foreground-secondary">
						{m.company_contact_customers()}{" "}
						<TextLink inline to="/pages/$slug" params={{ slug: "faq" }}>
							{m.page_faq()}
						</TextLink>
					</p>
				</div>
			</section>
		</>
	);
}

// The value reads first on screen; the label comes first for screen readers.
function Stat({ value, children }: { value: string; children: string }) {
	return (
		<div className="flex flex-col-reverse gap-1 py-8">
			<dt className="type-small text-muted-foreground">{children}</dt>
			<dd className="type-h3">{value}</dd>
		</div>
	);
}

// A statement without a photo of its own gets the brand mark: no stock person stands for
// the people who serve customers.
function Story(
	props: {
		title: string;
		body: string;
		link: React.ReactNode;
		flip?: boolean;
	} & (
		| { image: { src: string; alt: string; width: number; height: number } }
		| { image?: undefined; markLabel: string }
	),
) {
	const { image, title, body, link, flip = false } = props;
	return (
		<article className="grid gap-8 md:grid-cols-2 md:items-center md:gap-14">
			<div className={flip ? "md:order-2" : undefined}>
				{image ? (
					<img
						src={image.src}
						alt={image.alt}
						width={image.width}
						height={image.height}
						loading="lazy"
						className="aspect-[4/5] w-full bg-photo object-cover"
					/>
				) : (
					<div className="flex aspect-[4/5] w-full items-center justify-center bg-photo">
						<LogoMark label={props.markLabel} className="size-[40%]" />
					</div>
				)}
			</div>
			<div className="max-w-[44ch]">
				<h3 className="type-h2">{title}</h3>
				<p className="mt-4 type-lead text-foreground-secondary">{body}</p>
				<p className="mt-6 inline-flex items-center gap-2 font-bold">
					{link}
					<ArrowRight aria-hidden className="size-4" />
				</p>
			</div>
		</article>
	);
}

function Principle({ title, children }: { title: string; children: string }) {
	return (
		<li className="border-b py-6 md:odd:pr-10 md:even:border-l md:even:pl-10">
			<h3 className="type-h3">{title}</h3>
			<p className="mt-2 text-foreground-secondary">{children}</p>
		</li>
	);
}

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<>
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="font-medium">{value}</dd>
		</>
	);
}
