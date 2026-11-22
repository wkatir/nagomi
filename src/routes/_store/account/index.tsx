import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { AccountShell } from "#/components/store/account/account-shell";
import { AddressForm } from "#/components/store/account/address-form";
import { OrderHistory } from "#/components/store/account/order-history";
import {
	ConsentField,
	PhoneField,
	TextField,
} from "#/components/store/form-fields";
import { StoreButton } from "#/components/store/ui/store-button";
import { FieldError } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { api, parseResponse } from "#/lib/api";
import { authClient } from "#/lib/auth-client";
import { errorMessage } from "#/lib/errors";
import { pageTitle } from "#/lib/head";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

export const Route = createFileRoute("/_store/account/")({
	staticData: { noindex: true },
	loader: async ({ context }) => ({
		storeName: (await context.queryClient.ensureQueryData(storeQuery)).name,
	}),
	head: ({ loaderData }) => ({
		meta: loaderData
			? [pageTitle(m.account_title(), loaderData.storeName)]
			: [],
	}),
	component: AccountPage,
});

const profileQuery = {
	queryKey: ["account", "profile"],
	queryFn: () => parseResponse(api().account.profile.$get()),
} as const;

const addressesQuery = {
	queryKey: ["account", "addresses"],
	queryFn: () => parseResponse(api().account.addresses.$get()),
} as const;

function AccountPage() {
	const session = authClient.useSession();
	const firstName = session.data?.user.name.split(" ")[0] ?? "";
	return (
		<AccountShell
			title={m.account_greeting({ name: firstName })}
			description={m.account_intro()}
		>
			<AccountSections />
		</AccountShell>
	);
}

function AccountSections() {
	const profile = useQuery(profileQuery);
	return (
		<div className="grid gap-10">
			<OrderHistory />
			<section aria-labelledby="profile-title">
				<h2 id="profile-title" className="type-h2">
					{m.account_profile()}
				</h2>
				{profile.isPending ? (
					<Spinner aria-label={m.loading()} className="mt-4" />
				) : profile.isError ? (
					<FieldError className="mt-4">
						{errorMessage(profile.error)}
					</FieldError>
				) : (
					<div className="mt-3 grid gap-4 xl:grid-cols-2">
						<ProfileForm
							key={`${profile.data.name}-${profile.data.phone}`}
							name={profile.data.name ?? ""}
							email={profile.data.email ?? ""}
							phone={profile.data.phone ? profile.data.phone.slice(4) : ""}
						/>
						<ConsentsForm
							key={`${profile.data.consents.marketingEmail}-${profile.data.consents.marketingWhatsapp}`}
							email={profile.data.consents.marketingEmail === true}
							whatsapp={profile.data.consents.marketingWhatsapp === true}
						/>
					</div>
				)}
			</section>
			<AddressesSection />
		</div>
	);
}

function ProfileForm({
	name,
	email,
	phone,
}: {
	name: string;
	email: string;
	phone: string;
}) {
	const queryClient = useQueryClient();
	const [nameValue, setName] = useState(name);
	const [phoneValue, setPhone] = useState(phone);
	const save = useMutation({
		mutationFn: () =>
			parseResponse(
				api().account.profile.$patch({
					json: {
						name: nameValue.trim(),
						phone: phoneValue.trim()
							? `+503${phoneValue.replace(/\D/g, "")}`
							: null,
					},
				}),
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["account", "profile"] }),
	});
	return (
		<form
			className="panel grid content-start gap-4 p-5"
			onSubmit={(e) => {
				e.preventDefault();
				save.mutate();
			}}
		>
			<h3 className="type-h3">{m.account_personal_data()}</h3>
			<TextField
				id="profile-name"
				label={m.account_name()}
				value={nameValue}
				onChange={setName}
				required
				maxLength={80}
				autoComplete="name"
			/>
			<TextField
				id="profile-email"
				label={m.account_email()}
				value={email}
				onChange={() => {}}
				readOnly
				hint={m.account_email_fixed()}
				className="[&_input]:text-muted-foreground"
			/>
			<PhoneField
				id="profile-phone"
				label={m.checkout_phone()}
				value={phoneValue}
				onChange={setPhone}
			/>
			{save.isError && <FieldError>{errorMessage(save.error)}</FieldError>}
			{save.isSuccess && (
				<output className="block type-small text-success">
					{m.account_saved()}
				</output>
			)}
			<StoreButton
				type="submit"
				variant="outline"
				pending={save.isPending}
				className="justify-self-start"
			>
				{m.account_save()}
			</StoreButton>
		</form>
	);
}

function ConsentsForm({
	email,
	whatsapp,
}: {
	email: boolean;
	whatsapp: boolean;
}) {
	const queryClient = useQueryClient();
	const [marketingEmail, setEmail] = useState(email);
	const [marketingWhatsapp, setWhatsapp] = useState(whatsapp);
	const save = useMutation({
		mutationFn: () =>
			parseResponse(
				api().account.consents.$put({
					json: { locale: getLocale(), marketingEmail, marketingWhatsapp },
				}),
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["account", "profile"] }),
	});
	return (
		<form
			className="panel grid content-start gap-4 p-5"
			onSubmit={(e) => {
				e.preventDefault();
				save.mutate();
			}}
		>
			<div>
				<h3 className="type-h3">{m.account_consents()}</h3>
				<p className="mt-1 type-meta text-muted-foreground">
					{m.account_consents_body()}
				</p>
			</div>
			<ConsentField
				id="marketing-email"
				checked={marketingEmail}
				onChange={setEmail}
			>
				{m.cart_consent_marketing_email()}
			</ConsentField>
			<ConsentField
				id="marketing-whatsapp"
				checked={marketingWhatsapp}
				onChange={setWhatsapp}
			>
				{m.cart_consent_marketing_whatsapp()}
			</ConsentField>
			{save.isError && <FieldError>{errorMessage(save.error)}</FieldError>}
			{save.isSuccess && (
				<output className="block type-small text-success">
					{m.account_saved()}
				</output>
			)}
			<StoreButton
				type="submit"
				variant="outline"
				pending={save.isPending}
				className="justify-self-start"
			>
				{m.account_save()}
			</StoreButton>
		</form>
	);
}

function AddressesSection() {
	const queryClient = useQueryClient();
	const addresses = useQuery(addressesQuery);
	const [adding, setAdding] = useState(false);
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: ["account", "addresses"] });
	const archive = useMutation({
		mutationFn: (id: number) =>
			parseResponse(
				api().account.addresses[":id"].$delete({ param: { id: String(id) } }),
			),
		onSuccess: refresh,
	});
	const makeDefault = useMutation({
		mutationFn: (id: number) =>
			parseResponse(
				api().account.addresses[":id"].default.$post({
					param: { id: String(id) },
				}),
			),
		onSuccess: refresh,
	});
	const error = archive.error ?? makeDefault.error;
	return (
		<section aria-labelledby="addresses-title">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 id="addresses-title" className="type-h2">
					{m.account_addresses()}
				</h2>
				{!adding && (
					<StoreButton
						variant="outline"
						size="sm"
						onClick={() => setAdding(true)}
						className="gap-1.5"
					>
						<Plus aria-hidden className="size-4" />
						{m.account_add_address()}
					</StoreButton>
				)}
			</div>
			{addresses.isPending ? (
				<Spinner aria-label={m.loading()} className="mt-4" />
			) : addresses.isError ? (
				<FieldError className="mt-4">
					{errorMessage(addresses.error)}
				</FieldError>
			) : addresses.data.length === 0 ? (
				<p className="panel mt-3 flex items-center gap-3 p-5 type-small text-muted-foreground">
					<MapPin aria-hidden className="size-5" />
					{m.account_no_addresses()}
				</p>
			) : (
				<ul className="mt-3 grid gap-3 md:grid-cols-2">
					{addresses.data.map((a) => (
						<li
							key={a.id}
							className="panel grid content-start gap-1 p-5 type-small"
						>
							<p className="flex flex-wrap items-center gap-2 font-medium">
								{a.recipientName}
								{a.isDefault && (
									<span className="rounded-full bg-accent px-2 py-0.5 type-meta font-normal text-brand">
										{m.account_default_address()}
									</span>
								)}
							</p>
							<p className="text-foreground-secondary">{a.addressLine}</p>
							<p className="text-foreground-secondary">
								{a.municipality}, {a.department}
							</p>
							{a.reference && (
								<p className="text-muted-foreground">{a.reference}</p>
							)}
							<p className="text-muted-foreground tabular-nums">{a.phone}</p>
							<div className="mt-3 flex flex-wrap gap-2">
								{!a.isDefault && (
									<StoreButton
										variant="outline"
										size="sm"
										pending={
											makeDefault.isPending && makeDefault.variables === a.id
										}
										onClick={() => makeDefault.mutate(a.id)}
									>
										{m.account_make_default()}
									</StoreButton>
								)}
								<StoreButton
									variant="outline"
									size="sm"
									pending={archive.isPending && archive.variables === a.id}
									onClick={() => archive.mutate(a.id)}
									aria-label={m.account_archive_address_named({
										name: a.recipientName,
									})}
								>
									{m.account_archive_address()}
								</StoreButton>
							</div>
						</li>
					))}
				</ul>
			)}
			{error && <FieldError className="mt-3">{errorMessage(error)}</FieldError>}
			{adding && (
				<AddressForm
					className="mt-4"
					onDone={() => {
						setAdding(false);
						refresh();
					}}
					onCancel={() => setAdding(false)}
				/>
			)}
		</section>
	);
}
