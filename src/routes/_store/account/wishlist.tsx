import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AccountShell } from "#/components/store/account/account-shell";
import { ProductCard } from "#/components/store/product-card";
import { wishlistQuery } from "#/components/store/product-extras";
import { EmptyState } from "#/components/store/ui/empty-state";
import { StoreButton } from "#/components/store/ui/store-button";
import { FieldError } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { authClient } from "#/lib/auth-client";
import { errorMessage } from "#/lib/errors";
import { productsBySlugQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

export const Route = createFileRoute("/_store/account/wishlist")({
	staticData: { noindex: true },
	head: () => ({ meta: [{ title: m.wishlist_title() }] }),
	component: () => (
		<AccountShell title={m.wishlist_title()}>
			<Wishlist />
		</AccountShell>
	),
});

function Wishlist() {
	const session = authClient.useSession();
	const signedIn = session.data?.user.role === "customer";
	const list = useQuery({ ...wishlistQuery, enabled: signedIn });
	const slugs = list.data?.map((w) => w.slug) ?? [];
	const products = useQuery(productsBySlugQuery(getLocale(), slugs));
	if (list.isPending || (slugs.length > 0 && products.isPending))
		return (
			<Spinner aria-label={m.loading()} className="text-muted-foreground" />
		);
	const error = list.error ?? products.error;
	if (error) return <FieldError>{errorMessage(error)}</FieldError>;
	const items = [...(products.data?.items ?? [])].sort(
		(a, b) => slugs.indexOf(a.slug) - slugs.indexOf(b.slug),
	);
	if (items.length === 0)
		return (
			<EmptyState title={m.wishlist_empty()}>
				<StoreButton asChild>
					<Link to="/products">{m.home_cta_shop()}</Link>
				</StoreButton>
			</EmptyState>
		);
	return (
		<ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
			{items.map((p) => (
				<li key={p.slug} className="flex">
					<ProductCard product={p} headingLevel={2} className="w-full" />
				</li>
			))}
		</ul>
	);
}
