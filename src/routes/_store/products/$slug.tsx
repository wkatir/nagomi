import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { cn } from "cn";
import {
	ArrowUpRight,
	CreditCard,
	MessageCircle,
	ShieldCheck,
	ShoppingCart,
	Truck,
} from "lucide-react";
import { useState } from "react";
import { BundleCard } from "#/components/store/bundle-card";
import { ProductCard } from "#/components/store/product-card";
import {
	ProductReviews,
	StockAlertForm,
	WishlistButton,
} from "#/components/store/product-extras";
import { ProductGallery } from "#/components/store/product-gallery";
import { QuantityStepper } from "#/components/store/quantity-stepper";
import { Price } from "#/components/store/ui/price";
import { Rating } from "#/components/store/ui/rating";
import { SectionHeading } from "#/components/store/ui/section-heading";
import { StoreBreadcrumb } from "#/components/store/ui/store-breadcrumb";
import { StoreButton } from "#/components/store/ui/store-button";
import { TextAnchor, TextLink } from "#/components/store/ui/text-link";
import { useMoney } from "#/hooks/use-money";
import { isNotFound } from "#/lib/api";
import { useAddToCart, useCart, useMaxQuantity } from "#/lib/cart";
import { paymentMethodList } from "#/lib/payment";
import { productBadgeLabel } from "#/lib/product-badge";
import { productQuery, shippingZonesQuery, storeQuery } from "#/lib/queries";
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

const defaultVariant = <V extends { availability: string }>(
	variants: [V, ...V[]],
) => variants.find((v) => v.availability === "in_stock") ?? variants[0];

const RELATED_LIMIT = 5;

export const Route = createFileRoute("/_store/products/$slug")({
	loader: async ({ context, params }) => {
		try {
			const [store, product] = await Promise.all([
				context.queryClient.ensureQueryData(storeQuery),
				context.queryClient.ensureQueryData(
					productQuery(params.slug, getLocale()),
				),
				context.queryClient.ensureQueryData(shippingZonesQuery(getLocale())),
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
							name: p.category.name,
							url: localizedUrl(
								origin,
								`/categories/${p.category.slug}`,
								locale,
							),
						},
						{ name, url },
					]),
				),
			],
		};
	},
	component: ProductPage,
});

function ProductPage() {
	const { slug } = Route.useParams();
	return <ProductDetail key={slug} slug={slug} />;
}

function ProductDetail({ slug }: { slug: string }) {
	const locale = getLocale();
	const { data: p } = useSuspenseQuery(productQuery(slug, locale));
	const { data: store } = useSuspenseQuery(storeQuery);
	const variant = defaultVariant(p.variants);
	const money = useMoney();
	const [quantity, setQuantity] = useState(1);
	const storeLimit = useMaxQuantity();
	const inStock = variant.availability === "in_stock";
	const lowStock =
		inStock &&
		variant.maxQuantity <= store.lowStockThreshold &&
		variant.maxQuantity < store.maxQuantityPerLine;
	const room =
		variant.maxQuantity -
		(useCart().data?.lines.find((l) => l.sku === variant.sku)?.quantity ?? 0);
	const { add, pending } = useAddToCart();
	const fullName = `${p.brand.name} ${p.name}`;
	const email = store.business.email;
	const specs = p.shortSpecs?.split("·").map((s) => s.trim()) ?? [];
	const alternatives = p.related
		.filter((r) => r.relation === "alternative")
		.slice(0, RELATED_LIMIT);
	const helpHref = store.whatsappNumber
		? whatsappLink(
				store.whatsappNumber,
				m.product_help_message({ product: fullName }),
			)
		: email && `mailto:${email}?subject=${encodeURIComponent(fullName)}`;

	return (
		<div className="container-page pt-4 max-md:pb-20 md:pt-6">
			<StoreBreadcrumb
				trail={{
					ancestors: ["home"],
					current: { name: p.name, path: `/products/${p.slug}` },
				}}
				category={p.category}
			/>
			<div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8">
				<div className="min-w-0">
					<ProductGallery key={p.slug} images={p.images} label={fullName} />
				</div>

				<div className="flex min-w-0 flex-col">
					<div className="flex items-center gap-2">
						<TextLink
							variant="nav"
							to="/brands/$slug"
							params={{ slug: p.brand.slug }}
							className="min-h-7 type-meta font-medium tracking-[0.08em] text-brand uppercase"
						>
							{p.brand.name}
						</TextLink>
						{p.badge && inStock && (
							<span className="rounded-full bg-[#dcd6fb] px-2 py-0.5 text-[0.6875rem] font-medium text-[#1a1630]">
								{productBadgeLabel[p.badge]()}
							</span>
						)}
					</div>
					<h1 className="mt-1 type-h1 text-balance">{p.name}</h1>
					<Rating rating={p.rating} summary className="mt-2 self-start" />
					{p.tagline && (
						<p className="mt-3 type-body text-foreground-secondary">
							{p.tagline}
						</p>
					)}
					{specs.length > 0 && (
						<ul
							aria-label={m.product_short_specs()}
							className="mt-4 flex flex-wrap gap-2"
						>
							{specs.map((spec) => (
								<li
									key={spec}
									className="rounded-full border bg-card px-3 py-1 type-meta text-foreground-secondary"
								>
									{spec}
								</li>
							))}
						</ul>
					)}

					<div className="panel mt-5 grid gap-4 p-4 md:p-5">
						<div className="flex flex-wrap items-end justify-between gap-3">
							<div>
								<Price
									amount={variant.price}
									compareAt={variant.compareAtPrice}
									size="lg"
								/>
								<p className="mt-1 type-meta text-muted-foreground">
									{m.product_tax_included()}
									{variant.optionLabel && ` · ${variant.optionLabel}`}
								</p>
							</div>
							<StockState
								inStock={inStock}
								lowStock={lowStock}
								units={variant.maxQuantity}
							/>
						</div>
						<div
							data-buy-bar
							className="flex items-center gap-3 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:border-t max-md:bg-background/95 max-md:px-4 max-md:py-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:backdrop-blur"
						>
							<p className="tabular-nums md:hidden">
								<span className="block text-lg leading-tight font-semibold">
									{money(variant.price)}
								</span>
								<span className="block type-meta text-muted-foreground">
									{m.product_tax_included()}
								</span>
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
								disabled={room <= 0 || !inStock}
								pending={pending}
								onClick={(e) => {
									add(
										{ sku: variant.sku, quantity: Math.min(quantity, room) },
										e.currentTarget,
									);
									setQuantity(1);
								}}
								className="flex-1 gap-2"
							>
								<ShoppingCart aria-hidden className="size-5" />
								{inStock ? m.product_add_to_cart() : m.product_out_of_stock()}
							</StoreButton>
							<WishlistButton slug={p.slug} className="shrink-0" />
						</div>
						{inStock && room <= 0 && (
							<p className="type-meta text-muted-foreground">
								{variant.maxQuantity < storeLimit
									? m.cart_stock_reached()
									: m.cart_max_reached({ max: storeLimit })}
							</p>
						)}
						{!store.checkoutOpen && (
							<p className="type-small text-muted-foreground">
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
					</div>
					{!inStock && <StockAlertForm sku={variant.sku} className="mt-4" />}

					<ul className="panel mt-4 grid divide-y type-small">
						{p.warrantyMonths > 0 && (
							<InfoRow icon={ShieldCheck}>
								<span className="font-medium">
									{m.product_warranty({ months: p.warrantyMonths })}
								</span>
								<span className="block type-meta text-muted-foreground">
									{m.product_warranty_body()}
								</span>
							</InfoRow>
						)}
						<InfoRow icon={Truck}>
							<DeliveryInfo />
						</InfoRow>
						{store.paymentMethods.length > 0 && (
							<InfoRow icon={CreditCard}>
								{m.product_payment({
									methods: paymentMethodList(store.paymentMethods, locale),
								})}
							</InfoRow>
						)}
						{helpHref && (
							<InfoRow icon={MessageCircle}>
								<TextAnchor
									inline
									href={helpHref}
									target={store.whatsappNumber ? "_blank" : undefined}
									rel={store.whatsappNumber ? "noopener noreferrer" : undefined}
									className="inline-flex items-center gap-1"
								>
									{m.product_help()}
									<ArrowUpRight aria-hidden className="size-4" />
								</TextAnchor>
							</InfoRow>
						)}
					</ul>
				</div>
			</div>

			<div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8">
				{p.description && (
					<section aria-labelledby="description-title">
						<h2 id="description-title" className="type-h2">
							{m.product_description()}
						</h2>
						<div className="panel mt-4 p-5 type-body leading-relaxed whitespace-pre-line text-foreground-secondary">
							{p.description}
						</div>
					</section>
				)}
				{p.specs.length > 0 && (
					<section aria-labelledby="specs-title">
						<h2 id="specs-title" className="type-h2">
							{m.product_specs()}
						</h2>
						<div className="panel mt-4 overflow-hidden">
							<table className="w-full type-small">
								<tbody>
									{p.specs.map((spec) => (
										<tr
											key={spec.label}
											className="border-b last:border-b-0 even:bg-muted/40"
										>
											<th
												scope="row"
												className="w-2/5 px-4 py-3 text-left align-top font-normal text-muted-foreground"
											>
												{spec.label}
											</th>
											<td className="px-4 py-3 text-foreground">
												{spec.value}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				)}
			</div>

			<div className="mt-12">
				<ProductReviews slug={p.slug} name={p.name} />
			</div>

			{p.bundles.length > 0 && (
				<section aria-labelledby="product-bundles-title" className="mt-12">
					<SectionHeading
						id="product-bundles-title"
						title={m.product_bundles()}
						action={{ label: m.home_see_all(), link: { to: "/sets" } }}
					/>
					<ul className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{p.bundles.map((bundle) => (
							<li key={bundle.slug} className="flex">
								<BundleCard bundle={bundle} className="w-full" />
							</li>
						))}
					</ul>
				</section>
			)}

			{alternatives.length > 0 && (
				<section aria-labelledby="related-title" className="mt-12">
					<SectionHeading
						id="related-title"
						title={m.product_related_title()}
						action={{
							label: m.home_see_all(),
							link: {
								to: "/categories/$slug",
								params: { slug: p.category.slug },
							},
						}}
					/>
					<ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
						{alternatives.map((r) => (
							<li key={r.slug} className="flex">
								<ProductCard product={r} className="w-full" />
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}

function StockState({
	inStock,
	lowStock,
	units,
}: {
	inStock: boolean;
	lowStock: boolean;
	units: number;
}) {
	const tone = !inStock
		? "text-muted-foreground bg-muted"
		: lowStock
			? "text-warning bg-warning/10"
			: "text-success bg-success/10";
	return (
		<p
			className={cn(
				"inline-flex items-center gap-2 rounded-full px-3 py-1 type-meta font-medium",
				tone,
			)}
		>
			<span aria-hidden className="size-2 rounded-full bg-current" />
			{!inStock
				? m.product_out_of_stock()
				: lowStock
					? m.product_low_stock({ count: units })
					: m.product_in_stock()}
		</p>
	);
}

function InfoRow({
	icon: Icon,
	children,
}: {
	icon: typeof Truck;
	children: React.ReactNode;
}) {
	return (
		<li className="flex items-start gap-3 px-4 py-3">
			<Icon
				aria-hidden
				className="mt-0.5 size-[1.125rem] shrink-0 text-brand"
			/>
			<div className="min-w-0 flex-1">{children}</div>
		</li>
	);
}

function DeliveryInfo() {
	const money = useMoney();
	const { data } = useSuspenseQuery(shippingZonesQuery(getLocale()));
	return (
		<div>
			<p className="font-medium">{m.product_delivery_title()}</p>
			<ul className="mt-1 grid gap-0.5 type-meta text-muted-foreground">
				{data.zones.map((zone) => (
					<li key={zone.slug}>
						{m.product_delivery_zone({
							zone: zone.name,
							fee: money(zone.fee),
							min: String(zone.deliveryDaysMin),
							max: String(zone.deliveryDaysMax),
						})}
					</li>
				))}
				{data.freeShippingFrom !== null && (
					<li className="text-success">
						{m.product_delivery_free({ amount: money(data.freeShippingFrom) })}
					</li>
				)}
			</ul>
			<Link
				to="/pages/$slug"
				params={{ slug: "shipping" }}
				className="mt-1 inline-block type-meta underline underline-offset-4"
			>
				{m.page_shipping()}
			</Link>
		</div>
	);
}
