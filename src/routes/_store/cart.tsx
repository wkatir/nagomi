import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Lock } from "lucide-react";
import { useState } from "react";
import { CartLines } from "#/components/store/cart-lines";
import {
	CartTotals,
	CouponForm,
	FreeShippingProgress,
} from "#/components/store/cart-totals";
import { DemoNotice } from "#/components/store/demo-notice";
import { LocationFields } from "#/components/store/form-fields";
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
	const [department, setDepartment] = useState("");
	const [municipality, setMunicipality] = useState("");
	const cart = useCart(municipality || undefined);
	const lines = cart.data?.lines ?? [];
	const ready = store.checkoutOpen && !cart.data?.hasProblems;

	return (
		<div className="container-page pt-6 md:pt-8">
			<h1 className="type-h1">
				{m.cart_title()}
				{cart.data && cart.data.count > 0 && (
					<span className="ml-2 type-body font-normal text-muted-foreground tabular-nums">
						{m.cart_items_count({ count: cart.data.count })}
					</span>
				)}
			</h1>
			{cart.isPending ? (
				<Spinner
					aria-label={m.loading()}
					className="mt-8 text-muted-foreground"
				/>
			) : cart.isError ? (
				<FieldError className="mt-8">{errorMessage(cart.error)}</FieldError>
			) : lines.length === 0 ? (
				<EmptyState
					title={m.cart_empty()}
					description={m.cart_empty_hint()}
					className="mt-6"
				>
					<StoreButton asChild>
						<Link to="/products">{m.home_cta_shop()}</Link>
					</StoreButton>
				</EmptyState>
			) : (
				<div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-8">
					<section aria-label={m.cart_lines_label()}>
						<FreeShippingProgress cart={cart.data} className="panel mb-3 p-4" />
						<CartLines lines={lines} />
						<StoreButton asChild variant="link" className="mt-3">
							<Link to="/products">{m.cart_continue_shopping()}</Link>
						</StoreButton>
					</section>
					<aside
						aria-label={m.checkout_summary()}
						className="panel grid h-fit gap-5 p-5 lg:sticky lg:top-[calc(var(--header-height)+1.25rem)]"
					>
						<h2 className="type-h3">{m.checkout_summary()}</h2>
						<DemoNotice />
						<fieldset className="grid gap-3">
							<legend className="mb-2 type-small font-medium">
								{m.cart_estimate_title()}
							</legend>
							<LocationFields
								idPrefix="estimate"
								department={department}
								municipality={municipality}
								onDepartment={setDepartment}
								onMunicipality={setMunicipality}
								className="sm:grid-cols-1"
							/>
							{cart.data.noShippingZone && (
								<FieldError>
									{m.checkout_error_municipality_no_shipping_zone()}
								</FieldError>
							)}
							{cart.data.shippingQuote && (
								<p className="type-meta text-muted-foreground">
									{m.checkout_delivery_days({
										min: String(cart.data.shippingQuote.deliveryDaysMin),
										max: String(cart.data.shippingQuote.deliveryDaysMax),
									})}
								</p>
							)}
						</fieldset>
						<CouponForm cart={cart.data} />
						<CartTotals cart={cart.data} />
						{cart.data.hasProblems && (
							<FieldError>{m.cart_adjust_stock()}</FieldError>
						)}
						<StoreButton
							asChild={ready}
							size="lg"
							fullWidth
							disabled={!ready}
							className="gap-2"
						>
							{ready ? (
								<Link to="/checkout">
									{m.cart_continue_to_payment()}
									<ArrowRight aria-hidden className="size-5" />
								</Link>
							) : (
								m.cart_continue_to_payment()
							)}
						</StoreButton>
						{!store.checkoutOpen && (
							<p className="type-small text-muted-foreground">
								{m.error_checkout_not_configured()}
							</p>
						)}
						<p className="flex items-start gap-2 type-meta text-muted-foreground">
							<Lock aria-hidden className="mt-px size-3.5 shrink-0" />
							{m.checkout_no_hidden_costs()}
						</p>
					</aside>
				</div>
			)}
		</div>
	);
}
