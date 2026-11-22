import { Link } from "@tanstack/react-router";
import type * as React from "react";
import { StoreButton } from "./store-button";

type HeroImage = {
	src: string;
	width: number;
	height: number;
	alt: string;
};

export type HeroProps = {
	/** Desktop photo, 16:9. */
	image: HeroImage;
	/** Portrait crop for phones, 4:5. */
	mobileImage?: Omit<HeroImage, "alt"> | null;
	title: string;
	body?: string | null;
	/** `href` is an app path without locale, e.g. "/products?category=teclados". */
	cta: { label: string; href: string };
};

// A static hero, not a carousel (docs/research/2026-10-18-review/storefront-ux.md, section 1).
// On phones the text goes under the photo so it never covers a face.
export function Hero({ image, mobileImage, title, body, cta }: HeroProps) {
	return (
		<section className="relative surface-inverse">
			<div className="relative aspect-[4/5] overflow-hidden md:absolute md:inset-0 md:aspect-auto">
				<picture>
					{mobileImage && (
						<source
							media="(max-width: 767px)"
							srcSet={mobileImage.src}
							width={mobileImage.width}
							height={mobileImage.height}
						/>
					)}
					<img
						src={image.src}
						alt={image.alt}
						width={image.width}
						height={image.height}
						loading="eager"
						fetchPriority="high"
						decoding="sync"
						className="absolute inset-0 size-full object-cover"
					/>
				</picture>
				<div aria-hidden className="scrim absolute inset-0 max-md:hidden" />
			</div>
			<div className="relative pt-8 pb-12 md:flex md:h-[min(86svh,880px)] md:min-h-[560px] md:items-end md:pt-0 md:pb-24">
				<div className="container-page">
					<h1 className="max-w-[13ch] type-display text-balance">{title}</h1>
					{body && (
						<p className="mt-4 max-w-[38ch] type-lead text-inverse-foreground/85 md:mt-5">
							{body}
						</p>
					)}
					<StoreButton asChild size="lg" className="mt-6 md:mt-8">
						<AppPathLink href={cta.href}>{cta.label}</AppPathLink>
					</StoreButton>
				</div>
			</div>
		</section>
	);
}

// Links stored as data are plain strings; split them so the router localizes and navigates client-side.
function AppPathLink({
	href,
	...props
}: Omit<React.ComponentProps<"a">, "href"> & { href: string }) {
	if (!href.startsWith("/") || href.startsWith("//"))
		throw new Error(`Expected an app path, got "${href}"`);
	const url = new URL(href, "https://app.invalid");
	return (
		<Link
			to={url.pathname}
			search={Object.fromEntries(url.searchParams)}
			hash={url.hash ? url.hash.slice(1) : undefined}
			{...props}
		/>
	);
}
