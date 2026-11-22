import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "#/components/store/account/auth-form";
import { pageTitle } from "#/lib/head";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/_store/account/sign-up")({
	staticData: { noindex: true },
	loader: async ({ context }) => ({
		storeName: (await context.queryClient.ensureQueryData(storeQuery)).name,
	}),
	head: ({ loaderData }) => ({
		meta: loaderData
			? [pageTitle(m.account_sign_up_title(), loaderData.storeName)]
			: [],
	}),
	component: () => <AuthForm mode="sign-up" />,
});
