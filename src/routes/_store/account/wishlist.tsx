import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ProductCard } from "#/components/store/product-card";
import { wishlistQuery } from "#/components/store/product-extras";
import { EmptyState } from "#/components/store/ui/empty-state";
import { StoreButton } from "#/components/store/ui/store-button";
import { FieldError } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { authClient } from "#/lib/auth-client";
import { errorMessage } from "#/lib/errors";
import { catalogQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

export const Route = createFileRoute("/_store/account/wishlist")({
	staticData: { noindex: true },
	head: () => ({ meta: [{ title: m.wishlist_title() }] }),
	component: WishlistPage,
});

// Fetched in the browser: the account API needs the session cookie.
function WishlistPage() {
	const session = authClient.useSession();
	const signedIn = session.data?.user.role === "customer";
	const list = useQuery({ ...wishlistQuery, enabled: signedIn });
	const catalog = useQuery(catalogQuery(getLocale()));
	if (session.isPending || (signedIn && (list.isPending || catalog.isPending)))
		return (
			<div className="container-page py-16">
				<Spinner aria-label={m.loading()} className="text-muted-foreground" />
			</div>
		);
	if (!signedIn)
		return (
			<div className="container-page py-16">
				<p>{m.wishlist_sign_in()}</p>
				<StoreButton asChild className="mt-4">
					<Link to="/account/sign-in">{m.account_sign_in()}</Link>
				</StoreButton>
			</div>
		);
	const error = list.error ?? catalog.error;
	const slugs = list.data?.map((w) => w.slug) ?? [];
	const products = (catalog.data?.products ?? []).filter((p) =>
		slugs.includes(p.slug),
	);
	return (
		<div className="container-page py-section-sm">
			<h1 className="type-h1">{m.wishlist_title()}</h1>
			{error && <FieldError className="mt-6">{errorMessage(error)}</FieldError>}
			{!error && products.length === 0 ? (
				<EmptyState title={m.wishlist_empty()} className="mt-8">
					<StoreButton asChild>
						<Link to="/products">{m.home_cta_shop()}</Link>
					</StoreButton>
				</EmptyState>
			) : (
				<ul className="mt-8 grid grid-cols-4 gap-6 max-lg:grid-cols-3 max-md:grid-cols-2">
					{products.map((p) => (
						<li key={p.slug}>
							<ProductCard
								product={{
									slug: p.slug,
									rating: { average: null, count: 0 },
									name: p.name,
									tagline: p.tagline,
									shortSpecs: p.shortSpecs,
									isFeatured: p.isFeatured,
									badge: p.badge,
									brand: { slug: "", name: p.brand },
									category: { slug: p.category.slug, name: p.category.name },
									sku: p.sku,
									price: p.price,
									compareAtPrice: p.compareAtPrice,
									optionLabel: p.optionLabel,
									variantsCount: 1,
									availability: p.availability,
									maxQuantity: p.maxQuantity,
									packshot: p.images.find((i) => i.kind === "packshot") ?? null,
									lifestyle:
										p.images.find((i) => i.kind === "lifestyle") ?? null,
									createdAt: "",
								}}
							/>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
