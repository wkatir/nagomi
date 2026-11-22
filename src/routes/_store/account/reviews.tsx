import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AccountShell } from "#/components/store/account/account-shell";
import {
	myReviewsQueryKey,
	ReviewEditor,
	reviewStatusText,
} from "#/components/store/review-editor";
import { EmptyState } from "#/components/store/ui/empty-state";
import { Stars } from "#/components/store/ui/rating";
import { StoreButton } from "#/components/store/ui/store-button";
import { FieldError } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { api, parseResponse } from "#/lib/api";
import { authClient } from "#/lib/auth-client";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

export const Route = createFileRoute("/_store/account/reviews")({
	staticData: { noindex: true },
	head: () => ({ meta: [{ title: m.reviews_mine_title() }] }),
	component: () => (
		<AccountShell
			title={m.reviews_mine_title()}
			description={m.reviews_mine_body()}
		>
			<MyReviews />
		</AccountShell>
	),
});

function MyReviews() {
	const session = authClient.useSession();
	const signedIn = session.data?.user.role === "customer";
	const locale = getLocale();
	const list = useQuery({
		queryKey: [...myReviewsQueryKey, locale],
		queryFn: () =>
			parseResponse(api().account.reviews.$get({ query: { locale } })),
		enabled: signedIn,
	});
	if (list.isPending)
		return (
			<Spinner aria-label={m.loading()} className="text-muted-foreground" />
		);
	if (list.isError) return <FieldError>{errorMessage(list.error)}</FieldError>;
	if (list.data.length === 0)
		return (
			<EmptyState title={m.reviews_none_to_write()}>
				<StoreButton asChild variant="outline">
					<Link to="/account" hash="orders">
						{m.account_orders()}
					</Link>
				</StoreButton>
			</EmptyState>
		);
	return (
		<ul className="grid gap-4">
			{list.data.map((product) => (
				<li key={product.productId} className="panel p-5">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h2 className="type-h3">
							<Link
								to="/products/$slug"
								params={{ slug: product.slug }}
								className="underline-offset-4 hover:underline"
							>
								{product.name}
							</Link>
						</h2>
						{product.review && (
							<span className="flex items-center gap-2 type-meta text-muted-foreground">
								<Stars value={product.review.rating} className="text-sm" />
								<span className="rounded-full bg-accent px-2 py-0.5 text-foreground-secondary">
									{reviewStatusText[product.review.status]()}
								</span>
							</span>
						)}
					</div>
					<ReviewEditor product={product} className="mt-4" />
				</li>
			))}
		</ul>
	);
}
