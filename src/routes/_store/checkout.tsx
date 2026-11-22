import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { useEffect, useState } from "react";
import { CartTotals, CouponForm } from "#/components/store/cart-totals";
import { EmptyState } from "#/components/store/ui/empty-state";
import { StoreButton } from "#/components/store/ui/store-button";
import { TextLink } from "#/components/store/ui/text-link";
import { Checkbox } from "#/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "#/components/ui/native-select";
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
import { SV_LOCATIONS } from "#/lib/sv-locations";
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

const control = "h-(--control-lg) md:type-body";

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
	const municipalities =
		SV_LOCATIONS.find((l) => l.department === department)?.municipalities ?? [];

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
			<div className="container-page py-14">
				<EmptyState title={m.checkout_empty()}>
					<StoreButton asChild>
						<Link to="/products">{m.home_cta_shop()}</Link>
					</StoreButton>
				</EmptyState>
			</div>
		);
	const data: Cart = cart.data;
	const option = data.paymentOptions.find((o) => o.method === paymentMethod);

	return (
		<form
			noValidate
			className="container-page grid grid-cols-[1fr_400px] gap-14 py-14 max-md:grid-cols-1 max-md:gap-8 max-md:py-8"
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
		>
			<div className="grid content-start gap-8">
				<h1 className="type-h2">{m.checkout_title()}</h1>
				{!signedIn && (
					<p className="type-small text-muted-foreground">
						<TextLink inline to="/account/sign-in">
							{m.checkout_sign_in_prompt()}
						</TextLink>
					</p>
				)}

				<fieldset className="grid gap-4">
					<legend className="mb-2 type-h4">{m.checkout_contact()}</legend>
					<TextField
						id="name"
						label={m.checkout_name()}
						value={name}
						onChange={setName}
						autoComplete="name"
						error={shown("name")}
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
					<Field className="gap-1.5">
						<FieldLabel htmlFor="phone">{m.checkout_phone()}</FieldLabel>
						<div className="flex items-center gap-2">
							<span className="type-body text-muted-foreground">+503</span>
							<Input
								id="phone"
								type="tel"
								inputMode="numeric"
								autoComplete="tel-national"
								maxLength={9}
								value={phone}
								onChange={(e) =>
									setPhone(e.target.value.replace(/[^\d ]/g, ""))
								}
								aria-invalid={shown("phone") ? true : undefined}
								aria-describedby="phone-hint"
								className={control}
							/>
						</div>
						<p id="phone-hint" className="type-meta text-muted-foreground">
							{m.checkout_phone_hint()}
						</p>
						{shown("phone") && <FieldError>{shown("phone")}</FieldError>}
					</Field>
				</fieldset>

				<fieldset className="grid gap-4">
					<legend className="mb-2 type-h4">{m.checkout_delivery()}</legend>
					{(addresses.data?.length ?? 0) > 0 && (
						<RadioGroup
							className="gap-2"
							aria-label={m.checkout_saved_address()}
							value={addressId === null ? "new" : String(addressId)}
							onValueChange={(v) =>
								setAddressId(v === "new" ? null : Number(v))
							}
						>
							{addresses.data?.map((a) => (
								<Field
									key={a.id}
									orientation="horizontal"
									className={cn(
										"items-start gap-3 border p-3",
										addressId === a.id && "border-foreground",
									)}
								>
									<RadioGroupItem id={`address-${a.id}`} value={String(a.id)} />
									<FieldLabel
										htmlFor={`address-${a.id}`}
										className="type-small font-normal"
									>
										<span>
											<span className="font-medium">{a.recipientName}</span>
											<br />
											{a.addressLine}, {a.municipality}, {a.department}
										</span>
									</FieldLabel>
								</Field>
							))}
							<Field
								orientation="horizontal"
								className={cn(
									"items-start gap-3 border p-3",
									addressId === null && "border-foreground",
								)}
							>
								<RadioGroupItem id="address-new" value="new" />
								<FieldLabel
									htmlFor="address-new"
									className="type-small font-normal"
								>
									{m.checkout_new_address()}
								</FieldLabel>
							</Field>
						</RadioGroup>
					)}
					{shown("address") && <FieldError>{shown("address")}</FieldError>}
					{!saved && (
						<>
							<div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
								<Field className="gap-1.5">
									<FieldLabel htmlFor="department">
										{m.checkout_department()}
									</FieldLabel>
									<NativeSelect
										id="department"
										value={department}
										onChange={(e) => {
											setDepartment(e.target.value);
											setMunicipality("");
										}}
										aria-invalid={shown("department") ? true : undefined}
										className={control}
									>
										<NativeSelectOption value="">
											{m.checkout_choose()}
										</NativeSelectOption>
										{SV_LOCATIONS.map((l) => (
											<NativeSelectOption
												key={l.department}
												value={l.department}
											>
												{l.department}
											</NativeSelectOption>
										))}
									</NativeSelect>
									{shown("department") && (
										<FieldError>{shown("department")}</FieldError>
									)}
								</Field>
								<Field className="gap-1.5">
									<FieldLabel htmlFor="municipality">
										{m.checkout_municipality()}
									</FieldLabel>
									<NativeSelect
										id="municipality"
										value={municipality}
										onChange={(e) => setMunicipality(e.target.value)}
										disabled={!department}
										aria-invalid={shown("municipality") ? true : undefined}
										className={control}
									>
										<NativeSelectOption value="">
											{m.checkout_choose()}
										</NativeSelectOption>
										{municipalities.map((x) => (
											<NativeSelectOption key={x} value={x}>
												{x}
											</NativeSelectOption>
										))}
									</NativeSelect>
									{shown("municipality") && (
										<FieldError>{shown("municipality")}</FieldError>
									)}
								</Field>
							</div>
							<TextField
								id="address-line"
								label={m.checkout_address_line()}
								value={addressLine}
								onChange={setAddressLine}
								autoComplete="street-address"
								error={shown("addressLine")}
							/>
							<TextField
								id="reference"
								label={m.checkout_reference()}
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
						<p className="type-small text-muted-foreground">
							{m.checkout_delivery_days({
								min: String(data.shippingQuote.deliveryDaysMin),
								max: String(data.shippingQuote.deliveryDaysMax),
							})}
						</p>
					)}
				</fieldset>

				<fieldset className="grid gap-2">
					<legend className="mb-2 type-h4">{m.checkout_payment()}</legend>
					<RadioGroup
						className="gap-2"
						value={paymentMethod}
						onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
					>
						{data.paymentOptions.map((o) => (
							<Field
								key={o.method}
								orientation="horizontal"
								className={cn(
									"items-start gap-3 border p-3",
									!o.available && "opacity-60",
									paymentMethod === o.method && "border-foreground",
								)}
							>
								<RadioGroupItem
									id={`payment-${o.method}`}
									value={o.method}
									disabled={!o.available}
								/>
								<FieldLabel
									htmlFor={`payment-${o.method}`}
									className="type-small font-normal"
								>
									<span className="font-medium">
										{paymentLabel[o.method]()}
									</span>
									<br />
									<span className="text-muted-foreground">
										{o.available
											? o.method === "card"
												? m.checkout_payment_card_note()
												: o.method === "bank_transfer"
													? store.paymentDueHours === null
														? null
														: m.checkout_payment_transfer_note({
																hours: String(store.paymentDueHours),
															})
													: m.checkout_payment_cod_note()
											: o.reason === "outside_zone"
												? m.checkout_unavailable_outside_zone({
														zone: o.zoneName ?? "",
													})
												: o.reason === "over_max_total"
													? m.checkout_unavailable_over_max_total({
															amount: money(o.maxTotal ?? 0),
														})
													: o.reason === "address_required"
														? m.checkout_unavailable_address_required()
														: m.checkout_unavailable_not_configured()}
									</span>
								</FieldLabel>
							</Field>
						))}
					</RadioGroup>
					{tried && !option?.available && (
						<FieldError>{m.checkout_error_payment()}</FieldError>
					)}
					{fields.paymentMethod && (
						<FieldError>{m.checkout_error_payment()}</FieldError>
					)}
				</fieldset>

				<TextAreaField
					id="notes"
					label={m.checkout_notes()}
					value={notes}
					onChange={setNotes}
				/>

				<fieldset className="grid gap-3">
					<Consent
						id="terms"
						checked={terms}
						onChange={setTerms}
						error={shown("terms")}
					>
						<TextLink inline to="/pages/$slug" params={{ slug: "terms" }}>
							{m.checkout_consent_terms()}
						</TextLink>
					</Consent>
					<Consent
						id="privacy"
						checked={privacy}
						onChange={setPrivacy}
						error={shown("privacyNotice")}
					>
						<TextLink inline to="/pages/$slug" params={{ slug: "privacy" }}>
							{m.checkout_consent_privacy()}
						</TextLink>
					</Consent>
					<Consent
						id="marketing-email"
						checked={marketingEmail}
						onChange={setMarketingEmail}
					>
						{m.cart_consent_marketing_email()}
					</Consent>
					<Consent
						id="marketing-whatsapp"
						checked={marketingWhatsapp}
						onChange={setMarketingWhatsapp}
					>
						{m.cart_consent_marketing_whatsapp()}
					</Consent>
				</fieldset>
			</div>

			<aside className="grid h-fit gap-5 border p-6 md:sticky md:top-24">
				<h2 className="type-h4">{m.checkout_summary()}</h2>
				<ul className="grid gap-2 type-small">
					{data.lines.map((l) => (
						<li key={l.id} className="flex justify-between gap-3">
							<span>
								{l.quantity} × {[l.brand, l.name].filter(Boolean).join(" ")}
								{l.problem && (
									<span className="block text-destructive">
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
							<span className="tabular-nums">{money(l.lineTotal)}</span>
						</li>
					))}
				</ul>
				<CouponForm cart={data} />
				<CartTotals cart={data} />
				<p className="type-meta text-muted-foreground">
					{m.checkout_no_hidden_costs()}
				</p>
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
				<StoreButton
					type="submit"
					size="lg"
					fullWidth
					pending={order.isPending}
					disabled={data.hasProblems || !store.checkoutOpen}
				>
					{order.isPending
						? m.checkout_placing()
						: m.checkout_place_order({ amount: money(data.total) })}
				</StoreButton>
			</aside>
		</form>
	);
}

function TextField({
	id,
	label,
	value,
	onChange,
	error,
	...props
}: {
	id: string;
	label: string;
	value: string;
	onChange: (v: string) => void;
	error?: string | null;
} & Omit<React.ComponentProps<typeof Input>, "onChange" | "value" | "id">) {
	return (
		<Field className="gap-1.5">
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Input
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				aria-invalid={error ? true : undefined}
				className={control}
				{...props}
			/>
			{error && <FieldError>{error}</FieldError>}
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
				onChange={(e) => onChange(e.target.value)}
			/>
		</Field>
	);
}

function Consent({
	id,
	checked,
	onChange,
	error,
	children,
}: {
	id: string;
	checked: boolean;
	onChange: (v: boolean) => void;
	error?: string | null;
	children: React.ReactNode;
}) {
	return (
		<div>
			<Field orientation="horizontal" className="items-start gap-2.5">
				<Checkbox
					id={id}
					checked={checked}
					onCheckedChange={(c) => onChange(c === true)}
					aria-invalid={error ? true : undefined}
					className="tap-area mt-0.5 rounded-sm"
				/>
				<FieldLabel htmlFor={id} className="font-normal">
					{children}
				</FieldLabel>
			</Field>
			{error && <FieldError className="mt-1">{error}</FieldError>}
		</div>
	);
}
