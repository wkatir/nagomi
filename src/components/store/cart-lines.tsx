import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { Trash2 } from "lucide-react";
import type { CartRow } from "#/hooks/use-cart-rows";
import { useMoney } from "#/hooks/use-money";
import { cart, useMaxQuantity } from "#/lib/cart";
import { m } from "#/paraglide/messages";
import { QuantityStepper } from "./quantity-stepper";
import { StoreIconButton } from "./ui/store-button";
import { TextLink } from "./ui/text-link";

export function CartLines({
	rows,
	className,
}: {
	rows: CartRow[];
	className?: string;
}) {
	return (
		<ul className={cn("@container border-t", className)}>
			{rows.map((row) => (
				<CartLine key={row.sku} {...row} />
			))}
		</ul>
	);
}

const lineGrid =
	"grid grid-cols-[72px_1fr_auto] items-start gap-x-4 border-b py-5 @md:grid-cols-[96px_1fr_auto] @md:gap-x-5";

function CartLine({ sku, quantity, product }: CartRow) {
	const money = useMoney();
	const storeLimit = useMaxQuantity();

	if (!product)
		return (
			<li className={lineGrid}>
				<div className="aspect-square bg-photo" />
				<div>
					<p className="type-meta text-muted-foreground">{sku}</p>
					<p className="font-medium">{m.cart_unavailable()}</p>
				</div>
				<RemoveButton sku={sku} name={sku} />
			</li>
		);

	const image =
		product.images.find((i) => i.kind === "packshot") ?? product.images[0];
	const option = product.optionLabel;
	const unitPrice = m.cart_unit_price({ price: money(product.price) });
	// Units the variant has left, up to the store's limit (0 when sold out).
	const max = product.maxQuantity;

	return (
		<li className={lineGrid}>
			<Link
				to="/products/$slug"
				params={{ slug: product.slug }}
				tabIndex={-1}
				aria-hidden
				className={cn(
					"flex aspect-square items-center justify-center overflow-hidden bg-photo",
					image?.kind === "packshot" && "p-2",
				)}
			>
				{image && (
					<img
						src={image.url}
						alt=""
						width={image.width}
						height={image.height}
						loading="lazy"
						className={cn(
							"h-full w-full",
							image.kind === "packshot" ? "object-contain" : "object-cover",
						)}
					/>
				)}
			</Link>
			<div className="min-w-0">
				<p className="type-meta text-muted-foreground">{product.brand}</p>
				<TextLink
					inline
					variant="nav"
					to="/products/$slug"
					params={{ slug: product.slug }}
					className="leading-snug font-medium"
				>
					{product.name}
				</TextLink>
				<p className="type-meta text-muted-foreground tabular-nums">
					{option ? `${option} · ${unitPrice}` : unitPrice}
				</p>
				<div className="mt-3 flex items-center gap-2">
					{max === 0 ? (
						<p className="type-small font-medium">{m.product_out_of_stock()}</p>
					) : (
						<QuantityStepper
							value={quantity}
							max={max}
							onChange={(q) => cart.set(sku, q, max)}
							label={m.cart_quantity_of({ name: product.name })}
						/>
					)}
					<RemoveButton sku={sku} name={product.name} />
				</div>
				{max > 0 && quantity > max ? (
					<p className="mt-2 type-meta text-destructive">
						{m.cart_stock_left({ count: max })}
					</p>
				) : max > 0 && quantity === max ? (
					<p className="mt-2 type-meta text-muted-foreground">
						{max < storeLimit
							? m.cart_stock_reached()
							: m.cart_max_reached({ max: storeLimit })}
					</p>
				) : max > 0 ? (
					<p className="mt-2 type-meta text-success">{m.product_in_stock()}</p>
				) : null}
			</div>
			<p className="font-bold tabular-nums">
				{money(product.price * quantity)}
			</p>
		</li>
	);
}

function RemoveButton({ sku, name }: { sku: string; name: string }) {
	return (
		<StoreIconButton
			aria-label={m.cart_remove_item({ name })}
			title={m.cart_remove()}
			onClick={() => cart.remove(sku)}
			className="text-muted-foreground hover:text-foreground"
		>
			<Trash2 aria-hidden />
		</StoreIconButton>
	);
}
