import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { ShoppingCart } from "lucide-react";
import { Price } from "#/components/store/ui/price";
import { Rating } from "#/components/store/ui/rating";
import { StoreIconButton } from "#/components/store/ui/store-button";
import { useAddToCart } from "#/lib/cart";
import { productBadgeLabel } from "#/lib/product-badge";
import type { CatalogCard } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export function ProductCard({
	product: card,
	headingLevel = 3,
	loading = "lazy",
	className,
}: {
	product: CatalogCard;
	headingLevel?: 2 | 3;
	loading?: "eager" | "lazy";
	className?: string;
}) {
	const inStock = card.availability === "in_stock";
	const { add, pending } = useAddToCart();
	const Heading = `h${headingLevel}` as const;
	const specLine = card.shortSpecs ?? card.optionLabel ?? card.category.name;
	const badge = !inStock
		? m.ui_badge_sold_out()
		: card.badge
			? productBadgeLabel[card.badge]()
			: null;
	return (
		<article
			className={cn(
				"group/card panel relative flex min-w-0 flex-col overflow-hidden transition-colors hover:border-[#3a3858]",
				className,
			)}
		>
			<div className="relative aspect-[4/3] overflow-hidden bg-photo">
				{card.packshot && (
					<img
						src={card.packshot.url}
						alt={card.packshot.alt}
						width={card.packshot.width}
						height={card.packshot.height}
						loading={loading}
						decoding="async"
						sizes="(min-width: 1280px) 20vw, (min-width: 768px) 30vw, 50vw"
						className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover/card:scale-[1.03]"
					/>
				)}
				{badge && (
					<span
						className={cn(
							"absolute top-2.5 left-2.5 rounded-full px-2 py-0.5 text-[0.6875rem] leading-4 font-medium",
							inStock
								? "bg-[#dcd6fb] text-[#1a1630]"
								: "bg-background/85 text-foreground",
						)}
					>
						{badge}
					</span>
				)}
			</div>
			<div className="flex flex-1 flex-col p-3 pt-3.5">
				<Heading className="line-clamp-2 type-small font-medium text-foreground">
					<Link
						to="/products/$slug"
						params={{ slug: card.slug }}
						className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring"
					>
						{card.name}
					</Link>
				</Heading>
				{specLine && (
					<p className="mt-1 line-clamp-1 type-meta text-muted-foreground">
						{specLine}
					</p>
				)}
				<Rating rating={card.rating} className="mt-2" />
				<div className="mt-auto flex items-end justify-between gap-2 pt-3">
					<Price
						amount={card.price}
						compareAt={card.compareAtPrice}
						size="sm"
					/>
					<StoreIconButton
						disabled={!inStock || pending}
						aria-label={
							inStock
								? m.product_add_item({
										name: `${card.brand.name} ${card.name}`,
									})
								: m.product_out_of_stock()
						}
						onClick={(e) =>
							add({ sku: card.sku, quantity: 1 }, e.currentTarget)
						}
						className="tap-target relative z-10 size-8 shrink-0 rounded-lg bg-primary-gradient text-primary-foreground hover:bg-primary hover:text-primary-foreground hover:brightness-110 disabled:bg-none disabled:bg-muted disabled:text-muted-foreground"
					>
						<ShoppingCart aria-hidden className="size-4" />
					</StoreIconButton>
				</div>
			</div>
		</article>
	);
}
