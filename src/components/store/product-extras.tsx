import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { Heart, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	StoreButton,
	StoreIconButton,
} from "#/components/store/ui/store-button";
import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { api, apiErrorOf, parseResponse } from "#/lib/api";
import { authClient } from "#/lib/auth-client";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

export const wishlistQuery = {
	queryKey: ["account", "wishlist"],
	queryFn: () => parseResponse(api().account.wishlist.$get()),
};

const isCustomer = (role: unknown) => role === "customer";

// Guests are sent to sign in; the list belongs to the customer account.
export function WishlistButton({
	slug,
	className,
}: {
	slug: string;
	className?: string;
}) {
	const session = authClient.useSession();
	const signedIn = isCustomer(session.data?.user.role);
	const queryClient = useQueryClient();
	const list = useQuery({ ...wishlistQuery, enabled: signedIn });
	const saved = list.data?.some((w) => w.slug === slug) ?? false;
	const toggle = useMutation({
		mutationFn: () =>
			parseResponse(
				saved
					? api().account.wishlist[":slug"].$delete({ param: { slug } })
					: api().account.wishlist[":slug"].$put({ param: { slug } }),
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: wishlistQuery.queryKey }),
		onError: (e) => toast.error(errorMessage(e)),
	});
	if (!signedIn)
		return (
			<StoreIconButton asChild className={className}>
				<Link
					to="/account/sign-in"
					aria-label={m.wishlist_sign_in()}
					title={m.wishlist_sign_in()}
				>
					<Heart aria-hidden />
				</Link>
			</StoreIconButton>
		);
	return (
		<StoreIconButton
			aria-pressed={saved}
			aria-label={saved ? m.wishlist_remove() : m.wishlist_add()}
			title={saved ? m.wishlist_remove() : m.wishlist_add()}
			disabled={toggle.isPending}
			onClick={() => toggle.mutate()}
			className={className}
		>
			<Heart aria-hidden className={cn(saved && "fill-current")} />
		</StoreIconButton>
	);
}

export function Stars({
	value,
	className,
}: {
	value: number;
	className?: string;
}) {
	return (
		<span className={cn("inline-flex", className)} aria-hidden>
			{[1, 2, 3, 4, 5].map((n) => (
				<Star
					key={n}
					className={cn(
						"size-4",
						n <= Math.round(value) ? "fill-current" : "opacity-30",
					)}
				/>
			))}
		</span>
	);
}

export function RatingSummary({
	rating,
	className,
}: {
	rating: { average: number | null; count: number };
	className?: string;
}) {
	if (rating.average === null) return null;
	const average = rating.average.toLocaleString(getLocale(), {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	});
	return (
		<a
			href="#reviews"
			className={cn("inline-flex items-center gap-2 type-small", className)}
		>
			<Stars value={rating.average} />
			<span>{m.reviews_summary({ average, count: String(rating.count) })}</span>
		</a>
	);
}

export function ProductReviews({ slug }: { slug: string }) {
	const reviews = useQuery({
		queryKey: ["reviews", slug],
		queryFn: () =>
			parseResponse(api().products[":slug"].reviews.$get({ param: { slug } })),
	});
	const locale = getLocale();
	return (
		<section id="reviews" className="container-page py-12">
			<h2 className="type-h3">{m.reviews_title()}</h2>
			{reviews.isError && (
				<FieldError className="mt-4">{errorMessage(reviews.error)}</FieldError>
			)}
			{reviews.data && reviews.data.count === 0 && (
				<p className="mt-4 text-muted-foreground">{m.reviews_none()}</p>
			)}
			{reviews.data && reviews.data.count > 0 && (
				<>
					<RatingSummary rating={reviews.data} className="mt-3" />
					<ul className="mt-6 grid gap-6 md:grid-cols-2">
						{reviews.data.reviews.map((r) => (
							<li key={r.id} className="border-t pt-4">
								<Stars value={r.rating} />
								<p className="mt-2 font-medium">{r.title}</p>
								<p className="mt-1 text-foreground-secondary">{r.body}</p>
								<p className="mt-2 type-meta text-muted-foreground">
									{[
										r.author,
										m.reviews_verified(),
										new Date(r.createdAt).toLocaleDateString(locale),
									]
										.filter(Boolean)
										.join(" · ")}
								</p>
							</li>
						))}
					</ul>
				</>
			)}
		</section>
	);
}

// Shown on a sold-out size: the store writes to the customer when it is back.
export function StockAlertForm({
	sku,
	className,
}: {
	sku: string;
	className?: string;
}) {
	const [email, setEmail] = useState("");
	const request = useMutation({
		mutationFn: () =>
			parseResponse(api()["stock-alerts"].$post({ json: { sku, email } })),
	});
	const fieldError =
		apiErrorOf(request.error)?.code === "invalid_fields"
			? m.checkout_error_email_invalid()
			: request.isError
				? errorMessage(request.error)
				: null;
	if (request.isSuccess)
		return (
			<p className={cn("type-small text-success", className)}>
				{m.stock_alert_done({ email })}
			</p>
		);
	return (
		<form
			id="stock-alert"
			className={cn("grid gap-2 border p-4", className)}
			onSubmit={(e) => {
				e.preventDefault();
				request.mutate();
			}}
		>
			<p className="font-medium">{m.stock_alert_title()}</p>
			<p className="type-small text-muted-foreground">{m.stock_alert_body()}</p>
			<Field className="gap-1.5">
				<FieldLabel htmlFor="stock-alert-email">
					{m.checkout_email()}
				</FieldLabel>
				<Input
					id="stock-alert-email"
					type="email"
					inputMode="email"
					autoComplete="email"
					required
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					aria-invalid={fieldError ? true : undefined}
				/>
				{fieldError && <FieldError>{fieldError}</FieldError>}
			</Field>
			<StoreButton type="submit" pending={request.isPending}>
				{m.stock_alert_submit()}
			</StoreButton>
		</form>
	);
}
