import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { Trash2 } from "lucide-react";
import { useMoney } from "#/hooks/use-money";
import { type CartLine, useCartActions, useMaxQuantity } from "#/lib/cart";
import { m } from "#/paraglide/messages";
import { QuantityStepper } from "./quantity-stepper";
import { StoreIconButton } from "./ui/store-button";
import { TextLink } from "./ui/text-link";

export function CartLines({
	lines,
	className,
}: {
	lines: CartLine[];
	className?: string;
}) {
	return (
		<ul className={cn("@container border-t", className)}>
			{lines.map((line) => (
				<CartLineRow key={line.id} line={line} />
			))}
		</ul>
	);
}

const lineGrid =
	"grid grid-cols-[72px_1fr_auto] items-start gap-x-4 border-b py-5 @md:grid-cols-[96px_1fr_auto] @md:gap-x-5";

function CartLineRow({ line }: { line: CartLine }) {
	const money = useMoney();
	const storeLimit = useMaxQuantity();
	const { update } = useCartActions();

	if (line.problem === "unavailable" || line.unitPrice === null)
		return (
			<li className={lineGrid}>
				<div className="aspect-square bg-photo" />
				<div>
					<p className="font-medium">{m.cart_unavailable()}</p>
				</div>
				<RemoveButton id={line.id} name={line.name ?? ""} />
			</li>
		);

	const name = line.name ?? "";
	const unitPrice = m.cart_unit_price({ price: money(line.unitPrice) });
	const max = line.maxQuantity;
	const link =
		line.kind === "variant"
			? ({ to: "/products/$slug", params: { slug: line.slug ?? "" } } as const)
			: ({ to: "/sets/$slug", params: { slug: line.slug ?? "" } } as const);

	return (
		<li className={lineGrid}>
			<Link
				{...link}
				tabIndex={-1}
				aria-hidden
				className="flex aspect-square items-center justify-center overflow-hidden bg-photo p-2"
			>
				{line.image && (
					<img
						src={line.image.url}
						alt=""
						width={line.image.width}
						height={line.image.height}
						loading="lazy"
						className="h-full w-full object-contain"
					/>
				)}
			</Link>
			<div className="min-w-0">
				{line.brand && (
					<p className="type-meta text-muted-foreground">{line.brand}</p>
				)}
				<TextLink
					inline
					variant="nav"
					{...link}
					className="leading-snug font-medium"
				>
					{name}
				</TextLink>
				<p className="type-meta text-muted-foreground tabular-nums">
					{line.optionLabel ? `${line.optionLabel} · ${unitPrice}` : unitPrice}
				</p>
				{line.components.length > 0 && (
					<p className="type-meta text-muted-foreground">
						{m.cart_set_contains({
							items: line.components
								.map((c) =>
									c.quantity > 1 ? `${c.quantity} × ${c.name}` : c.name,
								)
								.join(", "),
						})}
					</p>
				)}
				<div className="mt-3 flex items-center gap-2">
					{max === 0 && line.quantity === 0 ? (
						<p className="type-small font-medium">{m.product_out_of_stock()}</p>
					) : (
						<QuantityStepper
							value={line.quantity}
							max={Math.max(max, 1)}
							onChange={(quantity) => update.mutate({ id: line.id, quantity })}
							label={m.cart_quantity_of({ name })}
						/>
					)}
					<RemoveButton id={line.id} name={name} />
				</div>
				{line.problem === "beyond_stock" ? (
					<p className="mt-2 type-meta text-destructive">
						{max === 0
							? m.product_out_of_stock()
							: m.cart_stock_left({ count: max })}
					</p>
				) : line.quantity === max ? (
					<p className="mt-2 type-meta text-muted-foreground">
						{max < storeLimit
							? m.cart_stock_reached()
							: m.cart_max_reached({ max: storeLimit })}
					</p>
				) : (
					<p className="mt-2 type-meta text-success">{m.product_in_stock()}</p>
				)}
			</div>
			<p className="font-bold tabular-nums">{money(line.lineTotal)}</p>
		</li>
	);
}

function RemoveButton({ id, name }: { id: number; name: string }) {
	const { remove } = useCartActions();
	return (
		<StoreIconButton
			aria-label={m.cart_remove_item({ name })}
			title={m.cart_remove()}
			disabled={remove.isPending}
			onClick={() => remove.mutate(id)}
			className="text-muted-foreground hover:text-foreground"
		>
			<Trash2 aria-hidden />
		</StoreIconButton>
	);
}
