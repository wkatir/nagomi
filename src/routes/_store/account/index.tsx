import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AddressForm } from "#/components/store/account/address-form";
import { OrderHistory } from "#/components/store/account/order-history";
import { StoreButton } from "#/components/store/ui/store-button";
import { Checkbox } from "#/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
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

const input = "h-(--control-lg) md:type-body";

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
	if (session.isPending)
		return (
			<div className="container-page py-16">
				<Spinner aria-label={m.loading()} className="text-muted-foreground" />
			</div>
		);
	if (!session.data)
		return (
			<div className="mx-auto max-w-md px-4 py-16">
				<h1 className="type-h2">{m.account_title()}</h1>
				<p className="mt-4 text-foreground-secondary">
					{m.account_signed_out()}
				</p>
				<div className="mt-8 flex flex-wrap gap-3">
					<StoreButton asChild size="lg">
						<Link to="/account/sign-in">{m.account_sign_in()}</Link>
					</StoreButton>
					<StoreButton asChild size="lg" variant="outline">
						<Link to="/account/sign-up">{m.account_sign_up()}</Link>
					</StoreButton>
				</div>
			</div>
		);
	return <Account />;
}

function Account() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const profile = useQuery(profileQuery);
	const signOut = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.signOut();
			if (error) throw new Error(error.message ?? "sign_out_failed");
		},
		onSuccess: async () => {
			queryClient.removeQueries({ queryKey: ["account"] });
			await navigate({ to: "/" });
		},
	});

	return (
		<div className="container-page grid gap-section-sm py-section-sm">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="type-h1">{m.account_title()}</h1>
					{profile.data && (
						<p className="mt-2 text-foreground-secondary">
							{profile.data.email}
						</p>
					)}
				</div>
				<StoreButton
					variant="outline"
					pending={signOut.isPending}
					onClick={() => signOut.mutate()}
				>
					{m.account_sign_out()}
				</StoreButton>
			</div>
			{profile.isPending ? (
				<Spinner aria-label={m.loading()} className="text-muted-foreground" />
			) : profile.isError ? (
				<FieldError>{errorMessage(profile.error)}</FieldError>
			) : (
				<>
					<ProfileSection
						key={`${profile.data.name}-${profile.data.phone}`}
						name={profile.data.name ?? ""}
						phone={profile.data.phone ?? ""}
					/>
					<ConsentsSection
						key={`${profile.data.consents.marketingEmail}-${profile.data.consents.marketingWhatsapp}`}
						email={profile.data.consents.marketingEmail === true}
						whatsapp={profile.data.consents.marketingWhatsapp === true}
					/>
				</>
			)}
			<AddressesSection />
			<OrderHistory />
		</div>
	);
}

function ProfileSection({ name, phone }: { name: string; phone: string }) {
	const queryClient = useQueryClient();
	const [nameValue, setName] = useState(name);
	const [phoneValue, setPhone] = useState(phone);
	const save = useMutation({
		mutationFn: () =>
			parseResponse(
				api().account.profile.$patch({
					json: { name: nameValue, phone: phoneValue.trim() || null },
				}),
			),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["account"] }),
	});
	return (
		<section aria-labelledby="profile-title" className="max-w-xl border p-6">
			<h2 id="profile-title" className="type-h3">
				{m.account_profile()}
			</h2>
			<form
				className="mt-5 grid gap-4"
				onSubmit={(e) => {
					e.preventDefault();
					save.mutate();
				}}
			>
				<Field className="gap-1.5">
					<FieldLabel htmlFor="profile-name">{m.account_name()}</FieldLabel>
					<Input
						id="profile-name"
						value={nameValue}
						onChange={(e) => setName(e.target.value)}
						required
						maxLength={80}
						autoComplete="name"
						className={input}
					/>
				</Field>
				<Field className="gap-1.5">
					<FieldLabel htmlFor="profile-phone">{m.account_phone()}</FieldLabel>
					<Input
						id="profile-phone"
						type="tel"
						value={phoneValue}
						onChange={(e) => setPhone(e.target.value)}
						maxLength={30}
						autoComplete="tel"
						placeholder="7123 4567"
						className={input}
					/>
				</Field>
				{save.isError && <FieldError>{errorMessage(save.error)}</FieldError>}
				{save.isSuccess && (
					<p className="type-small text-success">{m.account_saved()}</p>
				)}
				<StoreButton type="submit" pending={save.isPending} className="w-fit">
					{m.account_save()}
				</StoreButton>
			</form>
		</section>
	);
}

function ConsentsSection({
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
		<section aria-labelledby="consents-title" className="max-w-xl border p-6">
			<h2 id="consents-title" className="type-h3">
				{m.account_consents()}
			</h2>
			<div className="mt-5 grid gap-3">
				<Field orientation="horizontal" className="items-start gap-2.5">
					<Checkbox
						id="marketing-email"
						checked={marketingEmail}
						onCheckedChange={(checked) => setEmail(checked === true)}
						className="tap-area mt-0.5 rounded-sm"
					/>
					<FieldLabel htmlFor="marketing-email" className="font-normal">
						{m.cart_consent_marketing_email()}
					</FieldLabel>
				</Field>
				<Field orientation="horizontal" className="items-start gap-2.5">
					<Checkbox
						id="marketing-whatsapp"
						checked={marketingWhatsapp}
						onCheckedChange={(checked) => setWhatsapp(checked === true)}
						className="tap-area mt-0.5 rounded-sm"
					/>
					<FieldLabel htmlFor="marketing-whatsapp" className="font-normal">
						{m.cart_consent_marketing_whatsapp()}
					</FieldLabel>
				</Field>
				{save.isError && <FieldError>{errorMessage(save.error)}</FieldError>}
				{save.isSuccess && (
					<p className="type-small text-success">{m.account_saved()}</p>
				)}
				<StoreButton
					pending={save.isPending}
					onClick={() => save.mutate()}
					className="w-fit"
				>
					{m.account_save()}
				</StoreButton>
			</div>
		</section>
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
		<section aria-labelledby="addresses-title" className="max-w-3xl">
			<h2 id="addresses-title" className="type-h3">
				{m.account_addresses()}
			</h2>
			{addresses.isPending ? (
				<Spinner aria-label={m.loading()} className="mt-4" />
			) : addresses.isError ? (
				<FieldError className="mt-4">
					{errorMessage(addresses.error)}
				</FieldError>
			) : addresses.data.length === 0 ? (
				<p className="mt-4 text-muted-foreground">{m.account_no_addresses()}</p>
			) : (
				<ul className="mt-5 grid gap-4 md:grid-cols-2">
					{addresses.data.map((a) => (
						<li key={a.id} className="grid gap-1 border p-5 type-small">
							<p className="font-medium">
								{a.recipientName}
								{a.isDefault && (
									<span className="ml-2 type-meta text-muted-foreground">
										{m.account_default_address()}
									</span>
								)}
							</p>
							<p>{a.addressLine}</p>
							<p>
								{a.municipality}, {a.department}
							</p>
							{a.reference && (
								<p className="text-muted-foreground">{a.reference}</p>
							)}
							<p className="text-muted-foreground">{a.phone}</p>
							<div className="mt-3 flex flex-wrap gap-2">
								{!a.isDefault && (
									<StoreButton
										variant="outline"
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
									pending={archive.isPending && archive.variables === a.id}
									onClick={() => archive.mutate(a.id)}
								>
									{m.account_archive_address()}
								</StoreButton>
							</div>
						</li>
					))}
				</ul>
			)}
			{error && <FieldError className="mt-3">{errorMessage(error)}</FieldError>}
			{adding ? (
				<AddressForm
					className="mt-6"
					onDone={() => {
						setAdding(false);
						refresh();
					}}
					onCancel={() => setAdding(false)}
				/>
			) : (
				<StoreButton
					variant="outline"
					className="mt-6"
					onClick={() => setAdding(true)}
				>
					{m.account_add_address()}
				</StoreButton>
			)}
		</section>
	);
}
