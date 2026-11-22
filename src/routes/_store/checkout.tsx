import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { Banknote, CreditCard, Landmark, Lock, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { CartTotals, CouponForm } from "#/components/store/cart-totals";
import {
	ConsentField,
	LocationFields,
	PhoneField,
	TextField,
} from "#/components/store/form-fields";
import { EmptyState } from "#/components/store/ui/empty-state";
import { StoreButton } from "#/components/store/ui/store-button";
import { TextLink } from "#/components/store/ui/text-link";
import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { RadioGroup, RadioGroupItem } from "#/components/ui/radio-group";
import { Spinner } from "#/components/ui/spinner";
import { Textarea } from "#/components/ui/textarea";
import { useIdempotencyKey } from "#/hooks/use-idempotency-key";
import { useMoney } from "#/hooks/use-money";
import { api, apiErrorOf, parseResponse } from "#/lib/api";
import { authClient } from "#/lib/auth-client";
import { type Cart, invalidateCart, useCart } from "#/lib/cart";
import { errorMessage, promotionReasonMessage } from "#/lib/errors";
import { pageTitle } from "#/lib/head";
import { paymentLabel } from "#/lib/payment";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

export const Route = createFileRoute("/_store/checkout")({
	staticData: { noindex: true },
	loader: async ({ context }) => ({
		storeName: (await context.queryClient.ensureQueryData(storeQuery)).name,
	}),
	head: ({ loaderData }) => ({
		meta: loaderData
			? [pageTitle(m.checkout_title(), loaderData.storeName)]
			: [],
	}),
	component: Checkout,
});

const FIELD_MESSAGES: Record<string, Record<string, () => string>> = {
	name: { required: m.checkout_error_name_required },
	email: {
		required: m.checkout_error_email_required,
		invalid: m.checkout_error_email_invalid,
	},
	phone: {
		required: m.checkout_error_phone_required,
		invalid: m.checkout_error_phone_invalid,
	},
	department: { required: m.checkout_error_department_required },
	municipality: {
		required: m.checkout_error_municipality_required,
		unknown: m.checkout_error_municipality_unknown,
		no_shipping_zone: m.checkout_error_municipality_no_shipping_zone,
	},
	addressLine: { required: m.checkout_error_address_line_required },
	address: { not_found: m.checkout_error_address_not_found },
	terms: { required: m.checkout_error_terms_required },
	privacyNotice: { required: m.checkout_error_privacy_required },
};

const fieldMessage = (field: string, code: string | undefined) =>
	code === undefined
		? null
		: (FIELD_MESSAGES[field]?.[code] ?? m.checkout_error_payment)();

const profileQuery = {
	queryKey: ["account", "profile"],
	queryFn: () => parseResponse(api().account.profile.$get()),
};
const addressesQuery = {
	queryKey: ["account", "addresses"],
	queryFn: () => parseResponse(api().account.addresses.$get()),
};

function Checkout() {
	const locale = getLocale();
	const money = useMoney();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data: store } = useSuspenseQuery(storeQuery);
	const session = authClient.useSession();
	const signedIn = session.data?.user.role === "customer";
	const profile = useQuery({ ...profileQuery, enabled: signedIn });
	const addresses = useQuery({ ...addressesQuery, enabled: signedIn });

	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [addressId, setAddressId] = useState<number | null>(null);
	const [department, setDepartment] = useState("");
	const [municipality, setMunicipality] = useState("");
	const [addressLine, setAddressLine] = useState("");
	const [reference, setReference] = useState("");
	const [paymentMethod, setPaymentMethod] = useState<
		"card" | "bank_transfer" | "cash_on_delivery" | ""
	>("");
	const [terms, setTerms] = useState(false);
	const [privacy, setPrivacy] = useState(false);
	const [marketingEmail, setMarketingEmail] = useState(false);
	const [marketingWhatsapp, setMarketingWhatsapp] = useState(false);
	const [notes, setNotes] = useState("");

	useEffect(() => {
		const p = profile.data;
		if (!p) return;
		setName((v) => v || p.name || "");
		setEmail((v) => v || p.email || "");
		setPhone((v) => v || (p.phone ? p.phone.slice(4) : ""));
	}, [profile.data]);
	useEffect(() => {
		const list = addresses.data;
		if (!list || list.length === 0) return;
		setAddressId((v) => v ?? (list.find((a) => a.isDefault) ?? list[0]).id);
	}, [addresses.data]);

	const saved = addresses.data?.find((a) => a.id === addressId) ?? null;
	const deliveryMunicipality = saved ? saved.municipality : municipality;
	const cart = useCart(deliveryMunicipality || undefined);

	const request = {
		locale,
		name: name.trim(),
		email: email.trim(),
		phone: phone.trim() ? `+503${phone.replace(/\D/g, "")}` : "",
		delivery: saved
			? { addressId: saved.id }
			: {
					department,
					municipality,
					addressLine: addressLine.trim(),
					reference: reference.trim() || undefined,
				},
		paymentMethod: paymentMethod || ("bank_transfer" as const),
		consents: {
			privacyNotice: privacy,
			terms,
			marketingEmail,
			marketingWhatsapp,
		},
		notes: notes.trim() || undefined,
	};
	const idempotencyKey = useIdempotencyKey(request);
	const order = useMutation({
		mutationFn: () =>
			parseResponse(
				api().checkout.$post({ json: { ...request, idempotencyKey } }),
			),
		onSuccess: async (placed) => {
			await invalidateCart(queryClient);
			if (placed.redirectUrl) {
				window.location.assign(placed.redirectUrl);
				return;
			}
			await navigate({
				to: "/pedido/$code",
				params: { code: placed.code },
				search: { nuevo: 1 },
			});
		},
		onSettled: () => invalidateCart(queryClient),
	});
	const failure = apiErrorOf(order.error);
	const fields =
		failure?.code === "invalid_fields"
			? (failure.body.fields as Record<string, string>)
			: {};
	const err = (field: string) => fieldMessage(field, fields[field]);
	const [tried, setTried] = useState(false);
	const localErrors: Record<string, string | undefined> = tried
		? {
				name: name.trim() ? undefined : "required",
				email: email.trim() ? undefined : "required",
				phone: /^\d{8}$/.test(phone.replace(/\D/g, "")) ? undefined : "invalid",
				terms: terms ? undefined : "required",
				privacyNotice: privacy ? undefined : "required",
			}
		: {};
	const shown = (field: string) =>
		err(field) ?? fieldMessage(field, localErrors[field]);

	if (cart.isPending)
		return (
			<div className="container-page py-14">
				<Spinner aria-label={m.loading()} className="text-muted-foreground" />
			</div>
		);
	if (cart.isError)
		return (
			<div className="container-page py-14">
				<FieldError>{errorMessage(cart.error)}</FieldError>
			</div>
		);
	if (cart.data.lines.length === 0)
		return (
			<div className="container-page pt-8">
				<EmptyState
					title={m.checkout_empty()}
					description={m.cart_empty_hint()}
				>
					<StoreButton asChild>
						<Link to="/products">{m.home_cta_shop()}</Link>
					</StoreButton>
				</EmptyState>
			</div>
		);
	const data: Cart = cart.data;
	const option = data.paymentOptions.find((o) => o.method === paymentMethod);
	const unavailableReason = (o: Cart["paymentOptions"][number]) =>
		o.reason === "outside_zone"
			? m.checkout_unavailable_outside_zone({ zone: o.zoneName ?? "" })
			: o.reason === "over_max_total"
				? m.checkout_unavailable_over_max_total({
						amount: money(o.maxTotal ?? 0),
					})
				: o.reason === "address_required"
					? m.checkout_unavailable_address_required()
					: o.method === "card"
						? m.checkout_unavailable_card()
						: m.checkout_unavailable_not_configured();
	const availableNote = (method: Cart["paymentOptions"][number]["method"]) =>
		method === "card"
			? m.checkout_payment_card_note()
			: method === "bank_transfer"
				? store.paymentDueHours === null
					? null
					: m.checkout_payment_transfer_note({
							hours: String(store.paymentDueHours),
						})
				: m.checkout_payment_cod_note();

	return (
		<div className="container-page pt-6 md:pt-8">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<h1 className="type-h1">{m.checkout_title()}</h1>
				<p className="flex items-center gap-2 type-meta text-muted-foreground">
					<Lock aria-hidden className="size-3.5" />
					{m.checkout_secure_note()}
				</p>
			</div>
			{!signedIn && (
				<p className="mt-2 type-small text-muted-foreground">
					<TextLink inline to="/account/sign-in" className="text-foreground">
						{m.checkout_sign_in_prompt()}
					</TextLink>
				</p>
			)}
			<div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-8">
				<form
					id="checkout-form"
					noValidate
					onSubmit={(e) => {
						e.preventDefault();
						setTried(true);
						const ok =
							name.trim() &&
							email.trim() &&
							/^\d{8}$/.test(phone.replace(/\D/g, "")) &&
							terms &&
							privacy &&
							option?.available;
						if (ok) order.mutate();
					}}
					className="grid content-start gap-4"
				>
					<Step number={1} title={m.checkout_contact()}>
						<div className="grid gap-4 sm:grid-cols-2">
							<TextField
								id="name"
								label={m.checkout_name()}
								value={name}
								onChange={setName}
								autoComplete="name"
								error={shown("name")}
								className="sm:col-span-2"
							/>
							<TextField
								id="email"
								label={m.checkout_email()}
								type="email"
								inputMode="email"
								value={email}
								onChange={setEmail}
								autoComplete="email"
								error={shown("email")}
							/>
							<PhoneField
								id="phone"
								label={m.checkout_phone()}
								value={phone}
								onChange={setPhone}
								hint={m.checkout_phone_hint()}
								error={shown("phone")}
							/>
						</div>
					</Step>

					<Step number={2} title={m.checkout_delivery()}>
						{(addresses.data?.length ?? 0) > 0 && (
							<RadioGroup
								className="grid gap-2 sm:grid-cols-2"
								aria-label={m.checkout_saved_address()}
								value={addressId === null ? "new" : String(addressId)}
								onValueChange={(v) =>
									setAddressId(v === "new" ? null : Number(v))
								}
							>
								{addresses.data?.map((a) => (
									<ChoiceCard
										key={a.id}
										id={`address-${a.id}`}
										value={String(a.id)}
										title={a.recipientName}
										body={`${a.addressLine}, ${a.municipality}, ${a.department}`}
									/>
								))}
								<ChoiceCard
									id="address-new"
									value="new"
									title={m.checkout_new_address()}
								/>
							</RadioGroup>
						)}
						{shown("address") && <FieldError>{shown("address")}</FieldError>}
						{!saved && (
							<>
								<LocationFields
									idPrefix="delivery"
									department={department}
									municipality={municipality}
									onDepartment={setDepartment}
									onMunicipality={setMunicipality}
									errors={{
										department: shown("department"),
										municipality: shown("municipality"),
									}}
								/>
								<TextField
									id="address-line"
									label={m.checkout_address_line()}
									hint={m.checkout_address_line_hint()}
									value={addressLine}
									onChange={setAddressLine}
									autoComplete="street-address"
									error={shown("addressLine")}
								/>
								<TextField
									id="reference"
									label={m.checkout_reference()}
									hint={m.checkout_reference_hint()}
									value={reference}
									onChange={setReference}
								/>
							</>
						)}
						{data.noShippingZone && (
							<FieldError>
								{m.checkout_error_municipality_no_shipping_zone()}
							</FieldError>
						)}
						{data.shippingQuote && (
							<p className="flex items-start gap-2 type-small text-foreground-secondary">
								<Truck
									aria-hidden
									className="mt-0.5 size-4 shrink-0 text-brand"
								/>
								{m.checkout_shipping_summary({
									zone: data.shippingQuote.name,
									fee:
										data.shippingQuote.fee === 0
											? m.cart_shipping_free()
											: money(data.shippingQuote.fee),
									days: m.checkout_delivery_days({
										min: String(data.shippingQuote.deliveryDaysMin),
										max: String(data.shippingQuote.deliveryDaysMax),
									}),
								})}
							</p>
						)}
					</Step>

					<Step number={3} title={m.checkout_payment()}>
						<RadioGroup
							className="grid gap-2"
							aria-label={m.checkout_payment()}
							value={paymentMethod}
							onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
						>
							{data.paymentOptions.map((o) => (
								<ChoiceCard
									key={o.method}
									id={`payment-${o.method}`}
									value={o.method}
									disabled={!o.available}
									icon={PAYMENT_ICONS[o.method]}
									title={paymentLabel[o.method]()}
									body={
										o.available ? availableNote(o.method) : unavailableReason(o)
									}
								/>
							))}
						</RadioGroup>
						{((tried && !option?.available) || fields.paymentMethod) && (
							<FieldError>{m.checkout_error_payment()}</FieldError>
						)}
					</Step>

					<Step number={4} title={m.checkout_review()}>
						<ul className="grid gap-3">
							{data.lines.map((l) => (
								<li
									key={l.id}
									className="grid grid-cols-[48px_1fr_auto] items-center gap-3"
								>
									<span className="block aspect-square overflow-hidden rounded-lg bg-photo">
										{l.image && (
											<img
												src={l.image.url}
												alt=""
												width={l.image.width}
												height={l.image.height}
												loading="lazy"
												className="size-full object-cover"
											/>
										)}
									</span>
									<span className="min-w-0 type-small">
										<span className="block font-medium">
											{[l.brand, l.name].filter(Boolean).join(" ")}
										</span>
										<span className="block type-meta text-muted-foreground">
											{m.checkout_line_quantity({ count: l.quantity })}
										</span>
										{l.problem && (
											<span className="block type-meta text-destructive">
												{l.maxQuantity === 0
													? m.product_out_of_stock()
													: m.cart_stock_left({ count: l.maxQuantity })}{" "}
												{l.kind === "variant" && l.slug && (
													<TextLink
														inline
														to="/products/$slug"
														params={{ slug: l.slug }}
														hash="stock-alert"
													>
														{m.checkout_notify_me()}
													</TextLink>
												)}
											</span>
										)}
									</span>
									<span className="type-small tabular-nums">
										{money(l.lineTotal)}
									</span>
								</li>
							))}
						</ul>
						<TextAreaField
							id="notes"
							label={m.checkout_notes()}
							value={notes}
							onChange={setNotes}
						/>
						<fieldset className="grid gap-3 border-t pt-4">
							<legend className="sr-only">{m.checkout_consents()}</legend>
							<ConsentField
								id="terms"
								checked={terms}
								onChange={setTerms}
								error={shown("terms")}
							>
								<TextLink
									inline
									to="/pages/$slug"
									params={{ slug: "terms" }}
									className="text-foreground"
								>
									{m.checkout_consent_terms()}
								</TextLink>
							</ConsentField>
							<ConsentField
								id="privacy"
								checked={privacy}
								onChange={setPrivacy}
								error={shown("privacyNotice")}
							>
								<TextLink
									inline
									to="/pages/$slug"
									params={{ slug: "privacy" }}
									className="text-foreground"
								>
									{m.checkout_consent_privacy()}
								</TextLink>{" "}
								{m.store_consent_data_abroad()}
							</ConsentField>
							<ConsentField
								id="marketing-email"
								checked={marketingEmail}
								onChange={setMarketingEmail}
							>
								{m.cart_consent_marketing_email()}
							</ConsentField>
							<ConsentField
								id="marketing-whatsapp"
								checked={marketingWhatsapp}
								onChange={setMarketingWhatsapp}
							>
								{m.cart_consent_marketing_whatsapp()}
							</ConsentField>
						</fieldset>
					</Step>
				</form>

				<aside
					aria-label={m.checkout_summary()}
					className="panel grid h-fit gap-5 p-5 lg:sticky lg:top-[calc(var(--header-height)+1.25rem)]"
				>
					<div>
						<h2 className="type-h3">{m.checkout_summary()}</h2>
						<p className="type-meta text-muted-foreground">
							{m.cart_items_count({ count: data.count })}
						</p>
					</div>
					<CouponForm cart={data} />
					<CartTotals cart={data} />
					{failure?.code === "cart_changed" && (
						<FieldError>{m.checkout_cart_changed()}</FieldError>
					)}
					{failure?.code === "insufficient_stock" && (
						<FieldError>
							{(failure.body.items as { sku: string; available: number }[])
								.map((i) =>
									m.checkout_error_out_of_stock({
										product:
											data.lines.find((l) => l.sku === i.sku)?.name ?? i.sku,
										count: String(i.available),
									}),
								)
								.join(" ")}
						</FieldError>
					)}
					{failure?.code === "promotion_invalid" && (
						<FieldError>
							{promotionReasonMessage(String(failure.body.reason), null)}
						</FieldError>
					)}
					{order.isError &&
						failure?.code !== "invalid_fields" &&
						failure?.code !== "cart_changed" &&
						failure?.code !== "insufficient_stock" &&
						failure?.code !== "promotion_invalid" && (
							<FieldError>{errorMessage(order.error)}</FieldError>
						)}
					{tried &&
						(Object.values(localErrors).some(Boolean) ||
							failure?.code === "invalid_fields") && (
							<FieldError>{m.checkout_fix_fields()}</FieldError>
						)}
					<StoreButton
						type="submit"
						form="checkout-form"
						size="lg"
						fullWidth
						pending={order.isPending}
						disabled={data.hasProblems || !store.checkoutOpen}
					>
						{order.isPending
							? m.checkout_placing()
							: m.checkout_place_order({ amount: money(data.total) })}
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
			</div>
		</div>
	);
}

const PAYMENT_ICONS = {
	card: CreditCard,
	bank_transfer: Landmark,
	cash_on_delivery: Banknote,
} as const;

function Step({
	number,
	title,
	children,
}: {
	number: number;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="panel p-4 md:p-5">
			<h2 className="mb-4 flex items-center gap-3 type-h3">
				<span
					aria-hidden
					className="flex size-7 items-center justify-center rounded-full bg-accent type-small font-semibold text-brand"
				>
					{number}
				</span>
				{title}
			</h2>
			<div className="grid gap-4">{children}</div>
		</section>
	);
}

function ChoiceCard({
	id,
	value,
	disabled,
	icon: Icon,
	title,
	body,
}: {
	id: string;
	value: string;
	disabled?: boolean;
	icon?: typeof CreditCard;
	title: string;
	body?: string | null;
}) {
	return (
		<Field
			orientation="horizontal"
			className={cn(
				"relative items-start gap-3 rounded-lg border bg-background p-3.5 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/40",
				disabled && "opacity-75",
			)}
		>
			<RadioGroupItem
				id={id}
				value={value}
				disabled={disabled}
				className="mt-0.5"
			/>
			<FieldLabel htmlFor={id} className="block font-normal">
				<span className="flex flex-wrap items-center gap-2 type-small font-medium text-foreground">
					{Icon && <Icon aria-hidden className="size-4 text-brand" />}
					{title}
					{disabled && (
						<span className="rounded-full bg-muted px-2 py-0.5 type-meta font-normal text-muted-foreground">
							{m.checkout_unavailable()}
						</span>
					)}
				</span>
				{body && (
					<span className="mt-0.5 block type-meta text-muted-foreground">
						{body}
					</span>
				)}
			</FieldLabel>
		</Field>
	);
}

function TextAreaField({
	id,
	label,
	value,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<Field className="gap-1.5">
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Textarea
				id={id}
				value={value}
				maxLength={500}
				rows={3}
				onChange={(e) => onChange(e.target.value)}
				className="rounded-lg bg-background"
			/>
		</Field>
	);
}
