import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { StoreButton } from "#/components/store/ui/store-button";
import { TextLink } from "#/components/store/ui/text-link";
import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { authClient } from "#/lib/auth-client";
import { invalidateCart } from "#/lib/cart";
import { m } from "#/paraglide/messages";

const input = "h-(--control-lg) md:type-body";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const submit = useMutation({
		mutationFn: async () => {
			const { error } =
				mode === "sign-up"
					? await authClient.signUp.email({ name, email, password })
					: await authClient.signIn.email({ email, password });
			if (error) throw new Error(error.code ?? error.message ?? "auth_failed");
		},
		// The guest cart is merged into the customer's on the next cart read.
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

	return (
		<div className="mx-auto max-w-md px-4 py-16">
			<h1 className="type-h2">
				{mode === "sign-up"
					? m.account_sign_up_title()
					: m.account_sign_in_title()}
			</h1>
			<form
				className="mt-8 grid gap-5"
				onSubmit={(e) => {
					e.preventDefault();
					submit.mutate();
				}}
			>
				{mode === "sign-up" && (
					<Field className="gap-1.5">
						<FieldLabel htmlFor="account-name">{m.account_name()}</FieldLabel>
						<Input
							id="account-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							maxLength={80}
							autoComplete="name"
							className={input}
						/>
					</Field>
				)}
				<Field className="gap-1.5">
					<FieldLabel htmlFor="account-email">{m.account_email()}</FieldLabel>
					<Input
						id="account-email"
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						maxLength={120}
						autoComplete="email"
						className={input}
					/>
				</Field>
				<Field className="gap-1.5">
					<FieldLabel htmlFor="account-password">
						{m.account_password()}
					</FieldLabel>
					<Input
						id="account-password"
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						minLength={mode === "sign-up" ? 10 : undefined}
						maxLength={128}
						autoComplete={
							mode === "sign-up" ? "new-password" : "current-password"
						}
						className={input}
					/>
				</Field>
				{submit.isError && (
					<FieldError>{errorText(submit.error.message)}</FieldError>
				)}
				<StoreButton
					size="lg"
					fullWidth
					pending={submit.isPending}
					type="submit"
				>
					{mode === "sign-up" ? m.account_sign_up() : m.account_sign_in()}
				</StoreButton>
			</form>
			<p className="mt-6 type-small text-muted-foreground">
				{mode === "sign-up" ? (
					<>
						{m.account_have_account()}{" "}
						<TextLink inline to="/account/sign-in">
							{m.account_sign_in()}
						</TextLink>
					</>
				) : (
					<>
						{m.account_no_account()}{" "}
						<TextLink inline to="/account/sign-up">
							{m.account_sign_up()}
						</TextLink>
					</>
				)}
			</p>
		</div>
	);
}
