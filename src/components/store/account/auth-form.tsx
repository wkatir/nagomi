import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "#/components/brand/wordmark";
import { ConsentField, TextField } from "#/components/store/form-fields";
import { StoreButton } from "#/components/store/ui/store-button";
import { TextLink } from "#/components/store/ui/text-link";
import { FieldError } from "#/components/ui/field";
import { api, parseResponse } from "#/lib/api";
import { authClient } from "#/lib/auth-client";
import { invalidateCart } from "#/lib/cart";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

const MIN_PASSWORD = 10;

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const signUp = mode === "sign-up";
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [privacy, setPrivacy] = useState(false);
	const [marketingEmail, setMarketingEmail] = useState(false);
	const [marketingWhatsapp, setMarketingWhatsapp] = useState(false);
	const [tried, setTried] = useState(false);
	const submit = useMutation({
		mutationFn: async () => {
			const { error } = signUp
				? await authClient.signUp.email({ name, email, password })
				: await authClient.signIn.email({ email, password });
			if (error) throw new Error(error.code ?? error.message ?? "auth_failed");
			if (signUp)
				await parseResponse(
					api().account.consents.$put({
						json: {
							locale: getLocale(),
							privacyNotice: true,
							marketingEmail,
							marketingWhatsapp,
						},
					}),
				);
		},
		onSuccess: async () => {
			await invalidateCart(queryClient);
			await navigate({ to: "/account" });
		},
	});
	const errorText = (code: string) =>
		code === "USER_ALREADY_EXISTS" ||
		code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
			? m.account_error_email_taken()
			: code === "INVALID_EMAIL_OR_PASSWORD"
				? m.account_error_credentials()
				: code === "PASSWORD_TOO_SHORT"
					? m.account_error_password_short()
					: m.account_error_generic();
	const errors = tried
		? {
				name: signUp && !name.trim() ? m.checkout_error_name_required() : null,
				email: !email.trim() ? m.checkout_error_email_required() : null,
				password:
					password.length === 0
						? m.account_error_password_required()
						: signUp && password.length < MIN_PASSWORD
							? m.account_error_password_short()
							: null,
				privacy:
					signUp && !privacy ? m.checkout_error_privacy_required() : null,
			}
		: { name: null, email: null, password: null, privacy: null };

	return (
		<div className="container-page pt-8">
			<div className="panel relative mx-auto max-w-md overflow-hidden p-6 md:p-8">
				<div
					aria-hidden
					className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(ellipse_at_top,rgb(139_124_246/0.22),transparent_70%)]"
				/>
				<Logo className="relative mx-auto h-12" />
				<h1 className="relative mt-5 text-center type-h2">
					{signUp ? m.account_sign_up_title() : m.account_sign_in_title()}
				</h1>
				<p className="relative mt-1 text-center type-small text-muted-foreground">
					{signUp ? m.account_sign_up_body() : m.account_sign_in_body()}
				</p>
				<form
					noValidate
					className="relative mt-6 grid gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						setTried(true);
						const ok =
							email.trim() &&
							password.length > 0 &&
							(!signUp ||
								(name.trim() && password.length >= MIN_PASSWORD && privacy));
						if (ok) submit.mutate();
					}}
				>
					{signUp && (
						<TextField
							id="account-name"
							label={m.account_name()}
							value={name}
							onChange={setName}
							maxLength={80}
							autoComplete="name"
							error={errors.name}
						/>
					)}
					<TextField
						id="account-email"
						label={m.account_email()}
						type="email"
						inputMode="email"
						value={email}
						onChange={setEmail}
						maxLength={120}
						autoComplete="email"
						error={errors.email}
					/>
					<TextField
						id="account-password"
						label={m.account_password_label()}
						type="password"
						value={password}
						onChange={setPassword}
						maxLength={128}
						autoComplete={signUp ? "new-password" : "current-password"}
						hint={signUp ? m.account_password_hint() : undefined}
						error={errors.password}
					/>
					{signUp && (
						<fieldset className="grid gap-3 border-t pt-4">
							<legend className="sr-only">{m.checkout_consents()}</legend>
							<ConsentField
								id="account-privacy"
								checked={privacy}
								onChange={setPrivacy}
								error={errors.privacy}
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
								id="account-marketing-email"
								checked={marketingEmail}
								onChange={setMarketingEmail}
							>
								{m.cart_consent_marketing_email()}
							</ConsentField>
							<ConsentField
								id="account-marketing-whatsapp"
								checked={marketingWhatsapp}
								onChange={setMarketingWhatsapp}
							>
								{m.cart_consent_marketing_whatsapp()}
							</ConsentField>
						</fieldset>
					)}
					{submit.isError && (
						<FieldError>{errorText(submit.error.message)}</FieldError>
					)}
					<StoreButton
						size="lg"
						fullWidth
						pending={submit.isPending}
						type="submit"
						className="mt-1"
					>
						{signUp ? m.account_sign_up() : m.account_sign_in()}
					</StoreButton>
				</form>
				<p className="relative mt-6 text-center type-small text-muted-foreground">
					{signUp ? m.account_have_account() : m.account_no_account()}{" "}
					<TextLink
						inline
						to={signUp ? "/account/sign-in" : "/account/sign-up"}
						className="text-foreground"
					>
						{signUp ? m.account_sign_in() : m.account_sign_up()}
					</TextLink>
				</p>
			</div>
		</div>
	);
}
