import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Field } from "#/components/admin/field";
import { Wordmark } from "#/components/brand/wordmark";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { authClient } from "#/lib/auth-client";
import { signInMethodsQuery, storeQuery } from "#/lib/queries";
import { safeRedirect } from "#/lib/redirect";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin_/login")({
	ssr: false,
	staticData: { noindex: true },
	validateSearch: z.object({
		redirect: z.string().optional(),
		// Set by Better Auth when a social sign-in is rejected.
		error: z.string().optional(),
	}),
	beforeLoad: async ({ search }) => {
		const { data, error } = await authClient.getSession();
		if (error)
			throw new Error(
				`Session check failed: ${error.status} ${error.statusText}`,
			);
		if (data) throw redirect({ href: safeRedirect(search.redirect) });
	},
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(storeQuery),
			context.queryClient.ensureQueryData(signInMethodsQuery),
		]),
	head: () => ({
		meta: [{ title: m.admin_login_title() }],
	}),
	component: Login,
});

function signInError(status: number, code?: string) {
	if (status === 429) return m.admin_login_rate_limited();
	if (code === "BANNED_USER") return m.admin_login_banned();
	if (status === 401 || code === "INVALID_EMAIL_OR_PASSWORD")
		return m.admin_login_invalid();
	return m.error_generic();
}

function Login() {
	const router = useRouter();
	const { data: store } = useSuspenseQuery(storeQuery);
	const { data: methods } = useSuspenseQuery(signInMethodsQuery);
	const search = Route.useSearch();
	const [error, setError] = useState<string | null>(
		search.error ? m.admin_login_google_denied() : null,
	);
	const [pending, setPending] = useState(false);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		setPending(true);
		setError(null);
		const { error } = await authClient.signIn.email({
			email: String(form.get("email")),
			password: String(form.get("password")),
		});
		if (error) {
			setPending(false);
			return setError(signInError(error.status, error.code));
		}
		// Stays pending until the back office has loaded.
		await router.navigate({ href: safeRedirect(search.redirect) });
	}

	async function signInWithGoogle() {
		setPending(true);
		setError(null);
		const { error } = await authClient.signIn.social({
			provider: "google",
			callbackURL: safeRedirect(search.redirect),
			errorCallbackURL: "/admin/login",
		});
		if (error) {
			setPending(false);
			setError(m.error_generic());
		}
	}

	return (
		<main className="flex min-h-screen items-center justify-center px-4">
			<form onSubmit={onSubmit} className="grid w-full max-w-sm gap-5">
				<Wordmark label={store.name} className="text-[26px]" />
				<h1 className="type-h3">{m.admin_login_title()}</h1>
				{methods.google && (
					<Button
						type="button"
						size="lg"
						onClick={signInWithGoogle}
						disabled={pending}
					>
						{m.admin_login_google()}
					</Button>
				)}
				{methods.google && methods.password && (
					<p className="text-center type-small text-muted-foreground">
						{m.admin_login_or()}
					</p>
				)}
				{methods.password && (
					<>
						<Field id="email" label={m.admin_login_email()}>
							<Input
								id="email"
								name="email"
								type="email"
								autoComplete="username"
								required
							/>
						</Field>
						<Field id="password" label={m.admin_login_password()}>
							<Input
								id="password"
								name="password"
								type="password"
								autoComplete="current-password"
								required
							/>
						</Field>
					</>
				)}
				{error && (
					<p role="alert" className="type-small text-destructive">
						{error}
					</p>
				)}
				{methods.password && (
					<Button
						type="submit"
						size="lg"
						variant={methods.google ? "outline" : "default"}
						disabled={pending}
					>
						{pending ? m.admin_login_pending() : m.admin_login_submit()}
					</Button>
				)}
			</form>
		</main>
	);
}
