import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { cn } from "cn";
import { ShoppingCart } from "lucide-react";
import { StoreBreadcrumb } from "#/components/store/ui/store-breadcrumb";
import { StoreButton } from "#/components/store/ui/store-button";
import { useMoney } from "#/hooks/use-money";
import { isNotFound } from "#/lib/api";
import { useAddToCart } from "#/lib/cart";
import type { Trail } from "#/lib/crumbs";
import { bundleQuery, storeQuery } from "#/lib/queries";
import { listPageMeta } from "#/lib/seo";
import { siteOrigin } from "#/lib/site-origin";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

const trailOf = (slug: string, name: string): Trail => ({
	ancestors: ["home", "bundles"],
	current: { name, path: `/sets/${slug}` },
});

export const Route = createFileRoute("/_store/sets/$slug")({
	loader: async ({ context, params }) => {
		try {
			const [store, bundle] = await Promise.all([
				context.queryClient.ensureQueryData(storeQuery),
				context.queryClient.ensureQueryData(
					bundleQuery(params.slug, getLocale()),
				),
			]);
			return { store, bundle };
		} catch (e) {
			if (isNotFound(e)) throw notFound();
			throw e;
		}
	},
	head: ({ loaderData, params }) => {
		if (!loaderData) return {};
		const { store, bundle } = loaderData;
		return {
			meta: listPageMeta({
				origin: siteOrigin(),
				locale: getLocale(),
				storeName: store.name,
				title: bundle.seoTitle ?? bundle.name,
				description: bundle.seoDescription ?? bundle.description,
				trail: trailOf(params.slug, bundle.name),
				items: bundle.items.map((i) => ({
					name: `${i.product.brand.name} ${i.product.name}`,
					path: `/products/${i.product.slug}`,
				})),
			}),
		};
	},
	component: BundlePage,
});

function BundlePage() {
	const { slug } = Route.useParams();
	const { data: bundle } = useSuspenseQuery(bundleQuery(slug, getLocale()));
	const money = useMoney();
	const { add, pending } = useAddToCart();
	const available = bundle.availability === "in_stock";
	const percent = Math.round((bundle.saving * 100) / bundle.itemsTotal);
	return (
		<div className="container-page pt-4 md:pt-6">
			<StoreBreadcrumb trail={trailOf(slug, bundle.name)} />
			<div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8">
				<div className="panel grid aspect-square grid-cols-2 gap-px overflow-hidden bg-border">
					{bundle.items.map((item, index) => {
						const img = item.product.packshot;
						return (
							<div
								key={item.sku}
								className={cn(
									"overflow-hidden bg-photo",
									bundle.items.length % 2 === 1 && index === 0 && "col-span-2",
								)}
							>
								{img && (
									<img
										src={img.url}
										alt={img.alt}
										width={img.width}
										height={img.height}
										loading={index < 2 ? "eager" : "lazy"}
										decoding="async"
										className="size-full object-cover"
									/>
								)}
							</div>
						);
					})}
				</div>
				<div className="flex min-w-0 flex-col">
					<p className="type-meta font-medium tracking-[0.08em] text-brand uppercase">
						{m.nav_bundles()}
					</p>
					<h1 className="mt-1 type-h1 text-balance">{bundle.name}</h1>
					{bundle.description && (
						<p className="mt-3 type-body text-foreground-secondary">
							{bundle.description}
						</p>
					)}
					<div className="panel mt-5 grid gap-4 p-4 md:p-5">
						<div className="flex flex-wrap items-end justify-between gap-3">
							<div>
								<p className="type-small text-muted-foreground tabular-nums">
									<span className="sr-only">{m.bundle_items_total()} </span>
									<s>{money(bundle.itemsTotal)}</s>
								</p>
								<p className="text-[1.75rem] leading-none font-semibold tabular-nums">
									{money(bundle.price)}
								</p>
								<p className="mt-1 type-meta text-muted-foreground">
									{m.product_tax_included()}
								</p>
							</div>
							<p className="rounded-full bg-success/10 px-3 py-1 type-small font-medium text-success">
								{m.bundle_saving_percent({
									amount: money(bundle.saving),
									percent: String(percent),
								})}
							</p>
						</div>
						<StoreButton
							size="lg"
							fullWidth
							disabled={!available}
							pending={pending}
							onClick={(e) =>
								add({ bundle: bundle.slug, quantity: 1 }, e.currentTarget)
							}
							className="gap-2"
						>
							<ShoppingCart aria-hidden className="size-5" />
							{available ? m.bundle_add() : m.bundle_sold_out()}
						</StoreButton>
					</div>

					<section aria-labelledby="bundle-items-title" className="mt-6">
						<h2 id="bundle-items-title" className="type-h2">
							{m.bundle_products_title()}
						</h2>
						<ul className="panel mt-3 divide-y">
							{bundle.items.map((item) => (
								<li
									key={item.sku}
									className="grid grid-cols-[56px_1fr_auto] items-center gap-3 p-3"
								>
									<span className="block aspect-square overflow-hidden rounded-lg bg-photo">
										{item.product.packshot && (
											<img
												src={item.product.packshot.url}
												alt=""
												width={item.product.packshot.width}
												height={item.product.packshot.height}
												loading="lazy"
												className="size-full object-cover"
											/>
										)}
									</span>
									<span className="min-w-0">
										<Link
											to="/products/$slug"
											params={{ slug: item.product.slug }}
											className="type-small font-medium underline-offset-4 hover:underline"
										>
											{item.product.name}
										</Link>
										<span className="block type-meta text-muted-foreground tabular-nums">
											{m.bundle_item_line({
												quantity: String(item.quantity),
												price: money(item.price),
											})}
											{item.availability === "sold_out" &&
												` · ${m.product_out_of_stock()}`}
										</span>
									</span>
									<span className="type-small tabular-nums">
										{money(item.price * item.quantity)}
									</span>
								</li>
							))}
						</ul>
						<dl className="mt-3 grid gap-1.5 px-1 type-small">
							<div className="flex justify-between gap-4 text-muted-foreground">
								<dt>{m.bundle_total_separately()}</dt>
								<dd className="tabular-nums">
									<s>{money(bundle.itemsTotal)}</s>
								</dd>
							</div>
							<div className="flex justify-between gap-4 font-semibold">
								<dt>{m.bundle_total_set()}</dt>
								<dd className="tabular-nums">{money(bundle.price)}</dd>
							</div>
							<div className="flex justify-between gap-4 text-success">
								<dt>{m.bundle_total_saving()}</dt>
								<dd className="tabular-nums">{money(bundle.saving)}</dd>
							</div>
						</dl>
					</section>
				</div>
			</div>
		</div>
	);
}
