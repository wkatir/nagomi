import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { Price } from "#/components/store/ui/price";
import { StoreButton } from "#/components/store/ui/store-button";
import { Badge } from "#/components/ui/badge";
import { cart } from "#/lib/cart";
import { cartDrawer } from "#/lib/cart-ui";
import type { CatalogCard, CatalogProduct } from "#/lib/queries";
import { formatSize } from "#/lib/size";
import { m } from "#/paraglide/messages";

// Takes a store page card (GET /api/products) or a catalogue row (GET /api/catalog, still
// read by the home).
export function ProductCard({
	product,
	headingLevel = 3,
	loading = "lazy",
	className,
}: {
	product: CatalogCard | CatalogProduct;
	headingLevel?: 2 | 3;
	// "eager" for the cards in the first row, which are in view when the page opens.
	loading?: "eager" | "lazy";
	className?: string;
}) {
	const card = "images" in product ? fromCatalog(product) : product;
	const inStock = card.availability === "in_stock";
	const Heading = `h${headingLevel}` as const;
	const typeAndSize = [card.category.name, formatSize(card.size)]
		.filter(Boolean)
		.join(" · ");
	return (
		<article
			className={cn("group/card relative flex min-w-0 flex-col", className)}
		>
			<div className="relative aspect-[4/5] overflow-hidden bg-photo">
				{card.packshot && (
					<img
						src={card.packshot.url}
						alt={card.packshot.alt}
						width={card.packshot.width}
						height={card.packshot.height}
						loading={loading}
						decoding="async"
						className={cn(
							"absolute inset-0 size-full object-contain p-[11%] transition-opacity duration-300",
							card.lifestyle &&
								"md:group-hover/card:opacity-0 md:group-has-[a:focus-visible]/card:opacity-0",
						)}
					/>
				)}
				{card.lifestyle && (
					<img
						src={card.lifestyle.url}
						alt=""
						width={card.lifestyle.width}
						height={card.lifestyle.height}
						loading="lazy"
						decoding="async"
						className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-300 group-hover/card:opacity-100 group-has-[a:focus-visible]/card:opacity-100 max-md:hidden"
					/>
				)}
				{!inStock && (
					<Badge
						variant="secondary"
						className="absolute top-3 left-3 rounded-sm bg-background px-2 py-1.5 text-foreground"
					>
						{m.ui_badge_sold_out()}
					</Badge>
				)}
			</div>
			<div className="mt-3 flex flex-1 flex-col">
				<p className="type-meta text-muted-foreground">{card.brand.name}</p>
				<Heading className="mt-0.5 line-clamp-2 type-ui font-medium md:type-body">
					<Link
						to="/products/$slug"
						params={{ slug: card.slug }}
						className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-ring"
					>
						{card.name}
					</Link>
				</Heading>
				{typeAndSize && (
					<p className="mt-0.5 type-meta text-muted-foreground">
						{typeAndSize}
					</p>
				)}
				<Price
					amount={card.price}
					compareAt={card.compareAtPrice}
					size="sm"
					className="mt-2"
				/>
			</div>
			<div className="relative z-10 mt-3">
				<StoreButton
					variant="outline"
					fullWidth
					disabled={!inStock}
					aria-label={
						inStock
							? m.product_add_item({ name: `${card.brand.name} ${card.name}` })
							: undefined
					}
					onClick={(e) => {
						cart.add(card.sku, 1, card.maxQuantity);
						cartDrawer.open(e.currentTarget);
					}}
					className="px-2 type-small"
				>
					{inStock ? m.product_add() : m.product_out_of_stock()}
				</StoreButton>
			</div>
		</article>
	);
}

function fromCatalog(product: CatalogProduct) {
	const packshot =
		product.images.find((i) => i.kind === "packshot") ?? product.images[0];
	const lifestyle = product.images.find((i) => i.kind === "lifestyle");
	return {
		...product,
		brand: { name: product.brand },
		packshot: packshot ?? null,
		lifestyle: lifestyle && lifestyle !== packshot ? lifestyle : null,
	};
}
