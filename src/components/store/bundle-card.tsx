import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { ShoppingCart } from "lucide-react";
import { StoreIconButton } from "#/components/store/ui/store-button";
import { useMoney } from "#/hooks/use-money";
import { useAddToCart } from "#/lib/cart";
import type { BundleView } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export function BundleCard({
	bundle,
	headingLevel = 3,
	className,
}: {
	bundle: BundleView;
	headingLevel?: 2 | 3;
	className?: string;
}) {
	const money = useMoney();
	const available = bundle.availability === "in_stock";
	const { add, pending } = useAddToCart();
	const Heading = headingLevel === 2 ? "h2" : "h3";
	return (
		<article
			className={cn(
				"group/card panel relative flex flex-col overflow-hidden transition-colors hover:border-[#3a3858]",
				className,
			)}
		>
			<div
				className="grid aspect-[16/9] gap-px bg-border"
				style={{
					gridTemplateColumns: `repeat(${bundle.items.length}, minmax(0, 1fr))`,
				}}
			>
				{bundle.items.map((item) => {
					const img = item.product.packshot;
					return (
						<div key={item.sku} className="overflow-hidden bg-photo">
							{img && (
								<img
									src={img.url}
									alt={img.alt}
									width={img.width}
									height={img.height}
									loading="lazy"
									decoding="async"
									className="size-full object-cover transition-transform duration-500 group-hover/card:scale-[1.04]"
								/>
							)}
						</div>
					);
				})}
			</div>
			<div className="flex flex-1 flex-col p-4">
				<Heading className="type-h4">
					<Link
						to="/sets/$slug"
						params={{ slug: bundle.slug }}
						className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring"
					>
						{bundle.name}
					</Link>
				</Heading>
				<p className="mt-1 line-clamp-2 type-meta text-muted-foreground">
					{bundle.items
						.map((item) =>
							item.quantity > 1
								? `${item.quantity} × ${item.product.name}`
								: item.product.name,
						)
						.join(" + ")}
				</p>
				<div className="mt-auto flex items-end justify-between gap-3 pt-4">
					<div>
						<p className="type-meta text-muted-foreground tabular-nums">
							<span className="sr-only">{m.bundle_items_total()} </span>
							<s>{money(bundle.itemsTotal)}</s>
						</p>
						<p className="text-lg leading-tight font-semibold tabular-nums">
							{money(bundle.price)}
						</p>
						<p className="mt-1 inline-flex rounded-full bg-success/10 px-2 py-0.5 type-meta font-medium text-success">
							{m.bundle_saving({ amount: money(bundle.saving) })}
						</p>
					</div>
					<StoreIconButton
						disabled={!available || pending}
						aria-label={
							available
								? m.bundle_add_named({ name: bundle.name })
								: m.bundle_sold_out()
						}
						onClick={(e) =>
							add({ bundle: bundle.slug, quantity: 1 }, e.currentTarget)
						}
						className="tap-target relative z-10 size-9 shrink-0 rounded-lg bg-primary-gradient text-primary-foreground hover:bg-primary hover:text-primary-foreground hover:brightness-110 disabled:bg-none disabled:bg-muted disabled:text-muted-foreground"
					>
						<ShoppingCart aria-hidden className="size-4" />
					</StoreIconButton>
				</div>
			</div>
		</article>
	);
}
