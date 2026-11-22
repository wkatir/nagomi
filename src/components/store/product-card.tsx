import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { Price } from "#/components/store/ui/price";
import { StoreButton } from "#/components/store/ui/store-button";
import { Badge } from "#/components/ui/badge";
import { cart } from "#/lib/cart";
import { cartDrawer } from "#/lib/cart-ui";
import { productBadgeLabel } from "#/lib/product-badge";
import type { CatalogCard } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export function ProductCard({
	product,
	headingLevel = 3,
	loading = "lazy",
	className,
}: {
	product: CatalogCard;
	headingLevel?: 2 | 3;
	// "eager" for the cards in the first row, which are in view when the page opens.
	loading?: "eager" | "lazy";
	className?: string;
}) {
	const card = product;
	const inStock = card.availability === "in_stock";
	const Heading = `h${headingLevel}` as const;
	const specLine = card.shortSpecs ?? card.optionLabel ?? card.category.name;
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
				{(!inStock || card.badge) && (
					<Badge
						variant="secondary"
						className="absolute top-3 left-3 rounded-sm bg-background px-2 py-1.5 text-foreground"
					>
						{inStock && card.badge
							? productBadgeLabel[card.badge]()
							: m.ui_badge_sold_out()}
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
				{specLine && (
					<p className="mt-0.5 type-meta text-muted-foreground">{specLine}</p>
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
