import { StoreButton } from "#/components/store/ui/store-button";
import { TextLink } from "#/components/store/ui/text-link";
import { useMoney } from "#/hooks/use-money";
import { cart } from "#/lib/cart";
import { cartDrawer } from "#/lib/cart-ui";
import type { RoutineView } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export function RoutineCard({ routine }: { routine: RoutineView }) {
	const money = useMoney();
	const complete = routine.steps.every((s) => s.availability === "in_stock");
	return (
		<article className="flex h-full flex-col border">
			<div
				className="grid aspect-[16/10] grid-rows-[minmax(0,1fr)] overflow-hidden bg-photo"
				style={{
					gridTemplateColumns: `repeat(${routine.steps.length}, minmax(0, 1fr))`,
				}}
			>
				{routine.steps.map((step) => {
					const img = step.product.packshot;
					return (
						<div
							key={step.sku}
							className="flex h-full items-center justify-center px-[8%] py-[14%]"
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
				<h3 className="type-h3">{routine.title}</h3>
				{routine.description && (
					<p className="mt-2 line-clamp-3 type-small text-foreground-secondary">
						{routine.description}
					</p>
				)}
				<ol className="mt-5 grid gap-1.5 border-t pt-4 type-small">
					{routine.steps.map((step) => (
						<li key={step.sku} className="grid grid-cols-[18px_1fr] gap-2">
							<span className="text-muted-foreground tabular-nums">
								{step.position}
							</span>
							<span>
								<TextLink
									inline
									variant="nav"
									to="/products/$slug"
									params={{ slug: step.product.slug }}
								>
									{step.product.name}
								</TextLink>
								{step.availability === "sold_out" && (
									<span className="text-muted-foreground">
										{" "}
										· {m.product_out_of_stock()}
									</span>
								)}
							</span>
						</li>
					))}
				</ol>
				<div className="mt-auto flex items-end justify-between gap-4 pt-6">
					<div>
						<p className="type-meta text-muted-foreground">
							{m.routine_items({ count: routine.steps.length })}
						</p>
						<p className="type-stat">{money(routine.total)}</p>
					</div>
					<StoreButton
						disabled={!complete}
						onClick={(e) => {
							cart.addMany(
								routine.steps.map((step) => ({
									sku: step.sku,
									quantity: 1,
									max: step.maxQuantity,
								})),
							);
							cartDrawer.open(e.currentTarget);
						}}
						className="shrink-0"
					>
						{complete ? m.routine_add() : m.routine_sold_out()}
					</StoreButton>
				</div>
			</div>
		</article>
	);
}
