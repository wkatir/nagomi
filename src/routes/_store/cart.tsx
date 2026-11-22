import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { CartLines } from "#/components/store/cart-lines";
import { PaymentMethods } from "#/components/store/payment-methods";
import { EmptyState } from "#/components/store/ui/empty-state";
import { StoreButton } from "#/components/store/ui/store-button";
import { TextLink } from "#/components/store/ui/text-link";
import { Checkbox } from "#/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { useCartRows } from "#/hooks/use-cart-rows";
import { useIdempotencyKey } from "#/hooks/use-idempotency-key";
import { useMoney } from "#/hooks/use-money";
import { api, parseResponse } from "#/lib/api";
import { cart } from "#/lib/cart";
import { errorMessage } from "#/lib/errors";
import { pageTitle } from "#/lib/head";
import { invalidateCatalog, storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

export const Route = createFileRoute("/_store/cart")({
	staticData: { noindex: true },
	loader: async ({ context }) => ({
		storeName: (await context.queryClient.ensureQueryData(storeQuery)).name,
	}),
	head: ({ loaderData }) => ({
		meta: loaderData ? [pageTitle(m.cart_title(), loaderData.storeName)] : [],
	}),
	component: Cart,
});

function Cart() {
	const locale = getLocale();
	const money = useMoney();
	const { data: store } = useSuspenseQuery(storeQuery);
	const { catalog, rows, priced, hasUnavailable, hasBeyondStock, subtotal } =
		useCartRows();
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [accepted, setAccepted] = useState(false);
	const [orderTried, setOrderTried] = useState(false);
	const consentMissing = orderTried && !accepted;
	const consentBox = useRef<HTMLButtonElement>(null);
	const [marketingEmail, setMarketingEmail] = useState(false);
	const [marketingWhatsapp, setMarketingWhatsapp] = useState(false);
	const threshold = store.freeShippingFrom;
	const request = {
		locale,
		items: priced.map((r) => ({ sku: r.sku, quantity: r.quantity })),
		customerName: name.trim() || undefined,
		consents: {
			privacyNotice: true as const,
			terms: true as const,
			marketingEmail,
			marketingWhatsapp,
		},
	};
	const idempotencyKey = useIdempotencyKey(request);

	const order = useMutation({
		mutationFn: () =>
			parseResponse(
				api().orders.whatsapp.$post({ json: { ...request, idempotencyKey } }),
			),
		onSuccess: ({ whatsappUrl }) => {
			cart.clear();
			window.location.assign(whatsappUrl);
		},
		// Every order changes what is left; a refusal for stock shows the new units, here and
		// on the product lists.
		onSettled: () => invalidateCatalog(queryClient),
	});

	if (order.isSuccess)
		return (
			<div className="container-page py-24">
				<p className="type-small text-muted-foreground">
					{m.cart_sent_label({ code: order.data.code })}
				</p>
				<h1 className="mt-2 max-w-xl type-h2">{m.cart_sent_title()}</h1>
				<p className="mt-4 max-w-xl text-foreground-secondary">
					{m.cart_sent_body()}
				</p>
				<StoreButton asChild size="lg" className="mt-8">
					<a href={order.data.whatsappUrl}>{m.cart_open_whatsapp()}</a>
				</StoreButton>
			</div>
		);

	return (
		<div className="container-page grid grid-cols-[1fr_380px] gap-14 py-14 max-md:grid-cols-1 max-md:gap-8 max-md:py-8">
			<section>
				<h1 className="type-h2">{m.cart_title()}</h1>
				{catalog.isPending ? (
					<Spinner
						aria-label={m.loading()}
						className="mt-8 text-muted-foreground"
					/>
				) : catalog.isError ? (
					<FieldError className="mt-8">
						{errorMessage(catalog.error)}
					</FieldError>
				) : rows.length === 0 ? (
					<EmptyState title={m.cart_empty()} className="mt-8">
						<StoreButton asChild>
							<Link to="/products">{m.home_cta_shop()}</Link>
						</StoreButton>
					</EmptyState>
				) : (
					<CartLines rows={rows} className="mt-8" />
				)}
			</section>

			{catalog.isSuccess && rows.length > 0 && (
				<aside className="h-fit border p-6">
					<dl className="grid gap-2 type-body">
						<div className="flex justify-between">
							<dt>{m.cart_subtotal()}</dt>
							<dd className="font-bold tabular-nums">{money(subtotal)}</dd>
						</div>
						<div className="flex justify-between text-muted-foreground">
							<dt>{m.cart_shipping()}</dt>
							<dd>
								{threshold != null && subtotal >= threshold
									? m.cart_shipping_free()
									: m.cart_shipping_pending()}
							</dd>
						</div>
					</dl>
					{threshold != null && subtotal < threshold && (
						<p className="mt-3 type-small text-muted-foreground">
							{m.cart_free_shipping_gap({
								amount: money(threshold - subtotal),
							})}
						</p>
					)}
					<PaymentMethods methods={store.paymentMethods} className="mt-3" />
					<Field className="mt-6 gap-1.5">
						<FieldLabel htmlFor="customer-name">
							{m.cart_name_label()}
						</FieldLabel>
						<Input
							id="customer-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							maxLength={80}
							autoComplete="given-name"
							className="h-(--control-lg) md:type-body"
						/>
					</Field>
					<Field orientation="horizontal" className="mt-5 items-start gap-2.5">
						<Checkbox
							id="consent-legal"
							ref={consentBox}
							checked={accepted}
							onCheckedChange={(checked) => setAccepted(checked === true)}
							aria-invalid={consentMissing || undefined}
							aria-describedby={consentMissing ? "consent-missing" : undefined}
							className="tap-area mt-0.5 rounded-sm"
						/>
						<FieldLabel htmlFor="consent-legal" className="font-normal">
							<span>
								{m.cart_consent_legal()}{" "}
								<TextLink inline to="/pages/$slug" params={{ slug: "terms" }}>
									{m.cart_terms()}
								</TextLink>{" "}
								·{" "}
								<TextLink inline to="/pages/$slug" params={{ slug: "privacy" }}>
									{m.cart_privacy()}
								</TextLink>
							</span>
						</FieldLabel>
					</Field>
					{consentMissing && (
						<FieldError id="consent-missing" className="mt-2">
							{m.cart_consent_required()}
						</FieldError>
					)}
					<Field orientation="horizontal" className="mt-3 items-start gap-2.5">
						<Checkbox
							id="consent-marketing-email"
							checked={marketingEmail}
							onCheckedChange={(checked) => setMarketingEmail(checked === true)}
							className="tap-area mt-0.5 rounded-sm"
						/>
						<FieldLabel
							htmlFor="consent-marketing-email"
							className="font-normal"
						>
							{m.cart_consent_marketing_email()}
						</FieldLabel>
					</Field>
					<Field orientation="horizontal" className="mt-3 items-start gap-2.5">
						<Checkbox
							id="consent-marketing-whatsapp"
							checked={marketingWhatsapp}
							onCheckedChange={(checked) =>
								setMarketingWhatsapp(checked === true)
							}
							className="tap-area mt-0.5 rounded-sm"
						/>
						<FieldLabel
							htmlFor="consent-marketing-whatsapp"
							className="font-normal"
						>
							{m.cart_consent_marketing_whatsapp()}
						</FieldLabel>
					</Field>
					{/* Stays enabled without the legal consent, which it then asks for. */}
					<StoreButton
						size="lg"
						fullWidth
						pending={order.isPending}
						disabled={hasUnavailable || hasBeyondStock || !store.checkoutOpen}
						onClick={() => {
							if (!accepted) {
								setOrderTried(true);
								consentBox.current?.focus();
								return;
							}
							order.mutate();
						}}
						className="mt-5"
					>
						{order.isPending ? m.cart_checkout_pending() : m.cart_checkout()}
					</StoreButton>
					{hasUnavailable && (
						<FieldError className="mt-3">
							{m.cart_remove_unavailable()}
						</FieldError>
					)}
					{hasBeyondStock && (
						<FieldError className="mt-3">{m.cart_adjust_stock()}</FieldError>
					)}
					{!store.checkoutOpen && (
						<p className="mt-3 type-small text-muted-foreground">
							{m.error_checkout_not_configured()}
						</p>
					)}
					{order.isError && (
						<FieldError className="mt-3">
							{errorMessage(order.error)}
						</FieldError>
					)}
					<p className="mt-4 type-meta text-muted-foreground">
						{m.cart_legal()}
					</p>
				</aside>
			)}
		</div>
	);
}
