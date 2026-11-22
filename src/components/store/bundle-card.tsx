import { StoreButton } from "#/components/store/ui/store-button";
import { TextLink } from "#/components/store/ui/text-link";
import { useMoney } from "#/hooks/use-money";
import { cart } from "#/lib/cart";
import { cartDrawer } from "#/lib/cart-ui";
import type { BundleView } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export function BundleCard({
	bundle,
	headingLevel = 3,
}: {
	bundle: BundleView;
	headingLevel?: 2 | 3;
}) {
	const money = useMoney();
	const available = bundle.availability === "in_stock";
	const Heading = headingLevel === 2 ? "h2" : "h3";
	return (
		<article className="flex h-full flex-col border">
			<div
				className="grid aspect-[16/10] grid-rows-[minmax(0,1fr)] overflow-hidden bg-photo"
				style={{
					gridTemplateColumns: `repeat(${bundle.items.length}, minmax(0, 1fr))`,
				}}
			>
				{bundle.items.map((item) => {
					const img = item.product.packshot;
					return (
						<div
							key={item.sku}
							className="flex h-full items-center justify-center px-[6%] py-[12%]"
						>
							{img && (
								<img
									src={img.url}
									alt={img.alt}
									width={img.width}
									height={img.height}
									loading="lazy"
									className="h-full w-full object-contain"
								/>
							)}
						</div>
					);
				})}
			</div>
			<div className="flex flex-1 flex-col p-6 max-md:p-5">
				<Heading className="type-h3">
					<TextLink
						inline
						variant="nav"
						to="/sets/$slug"
						params={{ slug: bundle.slug }}
					>
						{bundle.name}
					</TextLink>
				</Heading>
				{bundle.description && (
					<p className="mt-2 line-clamp-3 type-small text-foreground-secondary">
						{bundle.description}
					</p>
				)}
				<ul className="mt-5 grid gap-1.5 border-t pt-4 type-small">
					{bundle.items.map((item) => (
						<li key={item.sku} className="grid grid-cols-[28px_1fr] gap-2">
							<span className="text-muted-foreground tabular-nums">
								{m.bundle_item_quantity({ quantity: item.quantity })}
							</span>
							<span>
								<TextLink
									inline
									variant="nav"
									to="/products/$slug"
									params={{ slug: item.product.slug }}
								>
									{item.product.name}
								</TextLink>
								{item.availability === "sold_out" && (
									<span className="text-muted-foreground">
										{" "}
										· {m.product_out_of_stock()}
									</span>
								)}
							</span>
						</li>
					))}
				</ul>
				<div className="mt-auto flex items-end justify-between gap-4 pt-6">
					<div>
						<p className="type-meta text-muted-foreground line-through">
							{money(bundle.itemsTotal)}
						</p>
						<p className="type-stat">{money(bundle.price)}</p>
						<p className="type-meta text-success">
							{m.bundle_saving({ amount: money(bundle.saving) })}
						</p>
					</div>
					<StoreButton
						disabled={!available}
						onClick={(e) => {
							cart.addMany(
								bundle.items.map((item) => ({
									sku: item.sku,
									quantity: item.quantity,
									max: item.maxQuantity,
								})),
							);
							cartDrawer.open(e.currentTarget);
						}}
						className="shrink-0"
					>
						{available ? m.bundle_add() : m.bundle_sold_out()}
					</StoreButton>
				</div>
			</div>
		</article>
	);
}
