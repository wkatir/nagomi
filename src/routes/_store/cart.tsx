import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CartLines } from "#/components/store/cart-lines";
import { CartTotals, CouponForm } from "#/components/store/cart-totals";
import { EmptyState } from "#/components/store/ui/empty-state";
import { StoreButton } from "#/components/store/ui/store-button";
import { FieldError } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { useCart } from "#/lib/cart";
import { errorMessage } from "#/lib/errors";
import { pageTitle } from "#/lib/head";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/_store/cart")({
	staticData: { noindex: true },
	loader: async ({ context }) => ({
		storeName: (await context.queryClient.ensureQueryData(storeQuery)).name,
	}),
	head: ({ loaderData }) => ({
		meta: loaderData ? [pageTitle(m.cart_title(), loaderData.storeName)] : [],
	}),
	component: CartPage,
});

function CartPage() {
	const { data: store } = useSuspenseQuery(storeQuery);
	const cart = useCart();
	const lines = cart.data?.lines ?? [];

	return (
		<div className="container-page grid grid-cols-[1fr_380px] gap-14 py-14 max-md:grid-cols-1 max-md:gap-8 max-md:py-8">
			<section>
				<h1 className="type-h2">{m.cart_title()}</h1>
				{cart.isPending ? (
					<Spinner
						aria-label={m.loading()}
						className="mt-8 text-muted-foreground"
					/>
				) : cart.isError ? (
					<FieldError className="mt-8">{errorMessage(cart.error)}</FieldError>
				) : lines.length === 0 ? (
					<EmptyState title={m.cart_empty()} className="mt-8">
						<StoreButton asChild>
							<Link to="/products">{m.home_cta_shop()}</Link>
						</StoreButton>
					</EmptyState>
				) : (
					<CartLines lines={lines} className="mt-8" />
				)}
			</section>

			{cart.data && lines.length > 0 && (
				<aside className="grid h-fit gap-5 border p-6">
					<CartTotals cart={cart.data} />
					<CouponForm cart={cart.data} />
					{cart.data.hasProblems && (
						<FieldError>{m.cart_adjust_stock()}</FieldError>
					)}
					<StoreButton
						asChild={store.checkoutOpen && !cart.data.hasProblems}
						size="lg"
						fullWidth
						disabled={!store.checkoutOpen || cart.data.hasProblems}
					>
						{store.checkoutOpen && !cart.data.hasProblems ? (
							<Link to="/checkout">{m.cart_go_checkout()}</Link>
						) : (
							m.cart_go_checkout()
						)}
					</StoreButton>
					{!store.checkoutOpen && (
						<p className="type-small text-muted-foreground">
							{m.error_checkout_not_configured()}
						</p>
					)}
					<p className="type-meta text-muted-foreground">
						{m.checkout_no_hidden_costs()}
					</p>
				</aside>
			)}
		</div>
	);
}
