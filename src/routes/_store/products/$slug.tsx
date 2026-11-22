import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { cn } from "cn";
import { ArrowRight, ArrowUpRight, ShieldCheck } from "lucide-react";
import { useState } from "react";
import {
	ProductReviews,
	RatingSummary,
	StockAlertForm,
	WishlistButton,
} from "#/components/store/product-extras";
import { ProductGallery } from "#/components/store/product-gallery";
import { QuantityStepper } from "#/components/store/quantity-stepper";
import { RelatedProducts } from "#/components/store/related-products";
import { Price } from "#/components/store/ui/price";
import { PromiseList } from "#/components/store/ui/promise-list";
import { StoreButton } from "#/components/store/ui/store-button";
import { TextAnchor, TextLink } from "#/components/store/ui/text-link";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbSeparator,
} from "#/components/ui/breadcrumb";
import { useMoney } from "#/hooks/use-money";
import { isNotFound } from "#/lib/api";
import { useAddToCart, useCart, useMaxQuantity } from "#/lib/cart";
import { paymentMethodList } from "#/lib/payment";
import { productBadgeLabel } from "#/lib/product-badge";
import { productQuery, storeQuery } from "#/lib/queries";
import {
	breadcrumbJsonLd,
	jsonLdMeta,
	localizedUrl,
	ogImageMeta,
	pageMeta,
	productJsonLd,
	shareImage,
	stockAvailability,
} from "#/lib/seo";
import { siteOrigin } from "#/lib/site-origin";
import { whatsappLink } from "#/lib/whatsapp";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

// The variant shown first: the cheapest in stock, else the cheapest (as on the cards).
const defaultVariant = <V extends { availability: string }>(
	variants: [V, ...V[]],
) => variants.find((v) => v.availability === "in_stock") ?? variants[0];

const helpLink = "gap-1.5 self-start type-small font-medium";

export const Route = createFileRoute("/_store/products/$slug")({
	loader: async ({ context, params }) => {
		try {
			const [store, product] = await Promise.all([
				context.queryClient.ensureQueryData(storeQuery),
				context.queryClient.ensureQueryData(
					productQuery(params.slug, getLocale()),
				),
			]);
			return { store, product };
		} catch (e) {
			if (isNotFound(e)) throw notFound();
			throw e;
		}
	},
	head: ({ loaderData, params }) => {
		if (!loaderData) return {};
		const { store, product: p } = loaderData;
		const variant = defaultVariant(p.variants);
		const origin = siteOrigin();
		const locale = getLocale();
		const url = localizedUrl(origin, `/products/${params.slug}`, locale);
		const name = `${p.brand.name} ${p.name}`;
		const images = p.images.map((i) => ({ ...i, url: `${origin}${i.url}` }));
		const photo = shareImage(images);
		return {
			meta: [
				...pageMeta({
					title: p.seoTitle ?? name,
					storeName: store.name,
					description: p.seoDescription ?? p.tagline,
				}),
				{ property: "og:type", content: "product" },
				...(photo ? ogImageMeta(photo) : []),
				jsonLdMeta(
					productJsonLd({
						url,
						name: p.name,
						brand: p.brand.name,
						description: p.description,
						images: images.map((i) => i.url),
						sku: variant.sku,
						price: variant.price,
						currency: store.currency,
						availability: stockAvailability(variant.availability),
						seller: store.name,
					}),
				),
				jsonLdMeta(
					breadcrumbJsonLd([
						{ name: m.nav_home(), url: localizedUrl(origin, "/", locale) },
						{
							name: m.shop_title(),
							url: localizedUrl(origin, "/products", locale),
						},
						{ name, url },
					]),
				),
			],
		};
	},
	component: ProductPage,
});

// Keyed by slug so the quantity chosen for one product does not carry over to the next.
function ProductPage() {
	const { slug } = Route.useParams();
	return <ProductDetail key={slug} slug={slug} />;
}

function ProductDetail({ slug }: { slug: string }) {
	const locale = getLocale();
	const { data: p } = useSuspenseQuery(productQuery(slug, locale));
	const { data: store } = useSuspenseQuery(storeQuery);
	// No product has two variants yet, so the page sells the default one.
	const variant = defaultVariant(p.variants);
	const promises = store.promises[locale];
	const money = useMoney();
	const [quantity, setQuantity] = useState(1);
	const storeLimit = useMaxQuantity();
	const inStock = variant.availability === "in_stock";
	// maxQuantity is already capped at the store's limit.
	const room =
		variant.maxQuantity -
		(useCart().data?.lines.find((l) => l.sku === variant.sku)?.quantity ?? 0);
	const { add, pending } = useAddToCart();
	const option = variant.optionLabel;
	const fullName = `${p.brand.name} ${p.name}`;
	const email = store.business.email;
	const methods = paymentMethodList(store.paymentMethods, locale);
	const helpLabel = (
		<>
			{m.product_help()}
			<ArrowUpRight aria-hidden className="size-4 shrink-0" />
		</>
	);

	return (
		<>
			<div className="container-page grid grid-cols-[7fr_5fr] gap-14 py-12 max-md:grid-cols-1 max-md:gap-6 max-md:py-4">
				<div className="min-w-0">
					<ProductGallery key={p.slug} images={p.images} label={fullName} />
				</div>

				<div className="flex flex-col">
					<Breadcrumb aria-label={m.nav_breadcrumb()} className="-mt-3">
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link
										to="/products"
										className="inline-flex min-h-11 items-center"
									>
										{m.product_back()}
									</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link
										to="/products"
										search={{ category: p.category.slug }}
										className="inline-flex min-h-11 items-center"
									>
										{p.category.name}
									</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
					<p className="mt-5 type-small text-muted-foreground max-md:mt-1">
						{p.brand.name}
					</p>
					{/* type-h1 (up to 68px) would set most product names in three or four lines
					    in the 5/12 column; type-h2 stays close to the 40px this page was drawn at. */}
					<div className="mt-1 flex items-start justify-between gap-3">
						<h1 className="type-h2">{p.name}</h1>
						<WishlistButton slug={p.slug} className="shrink-0" />
					</div>
					<RatingSummary rating={p.rating} className="mt-2" />
					{p.tagline && (
						<p className="mt-3 type-lead text-foreground-secondary">
							{p.tagline}
						</p>
					)}
					<p className="mt-6 flex flex-wrap items-baseline gap-x-3">
						<Price
							amount={variant.price}
							compareAt={variant.compareAtPrice}
							size="lg"
						/>
						{option && (
							<span className="type-body text-muted-foreground">{option}</span>
						)}
					</p>
					<p
						className={cn(
							"mt-2 type-small font-medium",
							inStock ? "text-success" : "text-muted-foreground",
						)}
					>
						{inStock ? m.product_in_stock() : m.product_out_of_stock()}
					</p>
					{p.shortSpecs && (
						<p className="mt-4 type-small text-foreground-secondary">
							{p.shortSpecs}
						</p>
					)}
					{p.badge && (
						<p className="mt-2 type-meta font-medium">
							{productBadgeLabel[p.badge]()}
						</p>
					)}

					{/* On phones the bar moves after the details, so it stays at the bottom of the
					    screen while they scroll, and carries the price it would otherwise cover.
					    Everything else in this column keeps the default order, so the bar stays last. */}
					<div
						data-buy-bar
						className="sticky bottom-0 z-10 mt-7 flex items-center gap-3 bg-background py-3 max-md:order-last max-md:-mx-4 max-md:border-t max-md:px-4"
					>
						<p className="tabular-nums md:hidden">
							<span className="block text-lg leading-tight font-bold">
								{money(variant.price)}
							</span>
							{option && (
								<span className="block type-meta text-muted-foreground">
									{option}
								</span>
							)}
						</p>
						{inStock && (
							<QuantityStepper
								className="max-md:hidden"
								size="lg"
								value={Math.min(quantity, Math.max(room, 1))}
								max={Math.max(room, 1)}
								onChange={setQuantity}
								label={m.product_quantity()}
							/>
						)}
						<StoreButton
							size="lg"
							disabled={room <= 0}
							pending={pending}
							onClick={(e) => {
								add(
									{ sku: variant.sku, quantity: Math.min(quantity, room) },
									e.currentTarget,
								);
								setQuantity(1);
							}}
							className="flex-1"
						>
							{inStock ? m.product_add_to_cart() : m.product_out_of_stock()}
						</StoreButton>
					</div>
					{!inStock && <StockAlertForm sku={variant.sku} className="mt-4" />}
					{inStock && room <= 0 && (
						<p className="type-meta text-muted-foreground max-md:mt-3">
							{variant.maxQuantity < storeLimit
								? m.cart_stock_reached()
								: m.cart_max_reached({ max: storeLimit })}
						</p>
					)}
					{/* Said before the bag fills, in the words the cart uses. */}
					{!store.checkoutOpen && (
						<p className="mt-3 type-small text-muted-foreground">
							{m.error_checkout_not_configured()}
							{email && (
								<>
									{" "}
									<TextAnchor inline href={`mailto:${email}`}>
										{m.product_order_by_email({ email })}
									</TextAnchor>
								</>
							)}
						</p>
					)}
					{store.paymentMethods.length > 0 && (
						<p className="mt-4 type-small">{m.product_payment({ methods })}</p>
					)}
					<div className="mt-1 flex flex-wrap gap-x-6">
						{store.whatsappNumber ? (
							<TextAnchor
								href={whatsappLink(
									store.whatsappNumber,
									m.product_help_message({ product: fullName }),
								)}
								target="_blank"
								rel="noopener noreferrer"
								className={helpLink}
							>
								{helpLabel}
							</TextAnchor>
						) : (
							email && (
								<TextAnchor
									href={`mailto:${email}?subject=${encodeURIComponent(fullName)}`}
									className={helpLink}
								>
									{helpLabel}
								</TextAnchor>
							)
						)}
						<TextLink
							to="/pages/$slug"
							params={{ slug: "faq" }}
							className={helpLink}
						>
							{m.page_faq()}
							<ArrowRight aria-hidden className="size-4" />
						</TextLink>
					</div>

					<PromiseList
						items={promises}
						className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-5"
					>
						{p.warrantyMonths > 0 && (
							<li className="col-span-2 flex items-start gap-2.5">
								<ShieldCheck aria-hidden className="size-5 shrink-0" />
								{m.product_warranty({ months: p.warrantyMonths })}
							</li>
						)}
					</PromiseList>
					<TextLink
						to="/pages/$slug"
						params={{ slug: "shipping" }}
						className={cn(helpLink, "mt-1")}
					>
						{m.page_shipping()}
						<ArrowRight aria-hidden className="size-4" />
					</TextLink>

					<h2 className="sr-only">{m.product_details_title()}</h2>
					<Accordion
						type="multiple"
						defaultValue={["what", "specs"]}
						className="mt-6 border-t"
					>
						{p.description && (
							<Detail value="what" term={m.product_description()}>
								<p className="whitespace-pre-line">{p.description}</p>
							</Detail>
						)}
						{p.specs.length > 0 && (
							<Detail value="specs" term={m.product_specs()}>
								<dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-4 gap-y-2">
									{p.specs.map((spec) => (
										<div key={spec.label} className="contents">
											<dt className="text-muted-foreground">{spec.label}</dt>
											<dd className="text-foreground">{spec.value}</dd>
										</div>
									))}
								</dl>
							</Detail>
						)}
					</Accordion>
				</div>
			</div>

			<ProductReviews slug={p.slug} />
			<RelatedProducts related={p.related} bundles={p.bundles} />
		</>
	);
}

// Every panel stays mounted, so the text of a closed one is in the page the server sends;
// the item hides it while closed (Radix does not when it is forced to stay mounted).
function Detail({
	value,
	term,
	children,
}: {
	value: string;
	term: string;
	children: React.ReactNode;
}) {
	return (
		<AccordionItem
			value={value}
			className="[&>[data-slot=accordion-content][data-state=closed]]:hidden"
		>
			<AccordionTrigger className="py-5 type-body font-bold hover:no-underline">
				{term}
			</AccordionTrigger>
			<AccordionContent
				forceMount
				className="grid gap-3 pb-5 type-body leading-relaxed text-foreground-secondary"
			>
				{children}
			</AccordionContent>
		</AccordionItem>
	);
}
