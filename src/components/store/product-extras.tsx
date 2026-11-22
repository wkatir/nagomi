import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { BellRing, Heart, MessageSquareText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	ReviewEditor,
	reviewStatusText,
} from "#/components/store/review-editor";
import { Rating, Stars, useAverageText } from "#/components/store/ui/rating";
import {
	StoreButton,
	StoreIconButton,
} from "#/components/store/ui/store-button";
import { TextLink } from "#/components/store/ui/text-link";
import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Progress } from "#/components/ui/progress";
import { Spinner } from "#/components/ui/spinner";
import { useStoreDate } from "#/hooks/use-store-date";
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
	const size = "size-(--control-xl)";
	if (!signedIn)
		return (
			<StoreIconButton
				variant="outline"
				asChild
				className={cn(size, className)}
			>
				<Link
					to="/account/sign-in"
					aria-label={m.wishlist_sign_in()}
					title={m.wishlist_sign_in()}
				>
					<Heart aria-hidden className="size-5" />
				</Link>
			</StoreIconButton>
		);
	return (
		<StoreIconButton
			variant="outline"
			aria-pressed={saved}
			aria-label={saved ? m.wishlist_remove() : m.wishlist_add()}
			title={saved ? m.wishlist_remove() : m.wishlist_add()}
			disabled={toggle.isPending}
			onClick={() => toggle.mutate()}
			className={cn(size, saved && "border-primary text-primary", className)}
		>
			<Heart aria-hidden className={cn("size-5", saved && "fill-current")} />
		</StoreIconButton>
	);
}

const REVIEWS_PAGE = 6;

export function ProductReviews({ slug, name }: { slug: string; name: string }) {
	const reviews = useQuery({
		queryKey: ["reviews", slug],
		queryFn: () =>
			parseResponse(api().products[":slug"].reviews.$get({ param: { slug } })),
	});
	const formatDate = useStoreDate();
	const averageText = useAverageText();
	const [shown, setShown] = useState(REVIEWS_PAGE);
	const data = reviews.data;
	return (
		<section
			id="reviews"
			aria-labelledby="reviews-title"
			className="scroll-mt-[calc(var(--header-height)+1rem)]"
		>
			<h2 id="reviews-title" className="type-h2">
				{m.reviews_title()}
			</h2>
			{reviews.isError && (
				<FieldError className="mt-4">{errorMessage(reviews.error)}</FieldError>
			)}
			{reviews.isPending && (
				<Spinner
					aria-label={m.loading()}
					className="mt-4 text-muted-foreground"
				/>
			)}
			<div className="mt-4 grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
				<div className="grid content-start gap-4">
					{data && data.average !== null && (
						<div className="panel p-5">
							<p className="flex items-baseline gap-2">
								<span className="text-4xl font-semibold tabular-nums">
									{averageText(data.average)}
								</span>
								<span className="type-small text-muted-foreground">
									{m.reviews_out_of_five()}
								</span>
							</p>
							<Rating rating={data} className="mt-1" />
							<ul
								className="mt-4 grid gap-1.5"
								aria-label={m.reviews_distribution()}
							>
								{data.distribution.map((row) => (
									<li
										key={row.stars}
										className="grid grid-cols-[4.75rem_1fr_2rem] items-center gap-2 type-meta text-muted-foreground"
									>
										<span>{m.reviews_stars({ count: row.stars })}</span>
										<Progress
											aria-hidden
											value={
												data.count > 0 ? (row.count / data.count) * 100 : 0
											}
											className="h-1.5 bg-muted [&>[data-slot=progress-indicator]]:bg-primary"
										/>
										<span className="text-right tabular-nums">{row.count}</span>
									</li>
								))}
							</ul>
						</div>
					)}
					<ReviewSlot slug={slug} name={name} />
				</div>
				<div>
					{data && data.count === 0 && (
						<div className="panel flex items-center gap-3 p-5 text-muted-foreground">
							<MessageSquareText aria-hidden className="size-5 shrink-0" />
							{m.reviews_none()}
						</div>
					)}
					{data && data.count > 0 && (
						<ul className="grid gap-3">
							{data.reviews.slice(0, shown).map((r) => (
								<li key={r.id} className="panel p-5">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<Stars value={r.rating} className="text-sm" />
										<span className="type-meta text-muted-foreground">
											{formatDate(r.createdAt, { dateStyle: "medium" })}
										</span>
									</div>
									<p className="sr-only">
										{m.reviews_stars({ count: r.rating })}
									</p>
									<h3 className="mt-2 type-h4">{r.title}</h3>
									<p className="mt-1 type-small text-foreground-secondary">
										{r.body}
									</p>
									<p className="mt-3 type-meta text-muted-foreground">
										{[r.author, m.reviews_verified()]
											.filter(Boolean)
											.join(" · ")}
									</p>
								</li>
							))}
						</ul>
					)}
					{data && data.reviews.length > shown && (
						<StoreButton
							variant="outline"
							onClick={() => setShown((n) => n + REVIEWS_PAGE)}
							className="mt-4"
						>
							{m.reviews_more({ count: data.reviews.length - shown })}
						</StoreButton>
					)}
				</div>
			</div>
		</section>
	);
}

function ReviewSlot({ slug, name }: { slug: string; name: string }) {
	const session = authClient.useSession();
	const signedIn = isCustomer(session.data?.user.role);
	const locale = getLocale();
	const mine = useQuery({
		queryKey: ["account", "reviews", locale],
		queryFn: () =>
			parseResponse(api().account.reviews.$get({ query: { locale } })),
		enabled: signedIn,
	});
	if (session.isPending) return null;
	if (!signedIn)
		return (
			<p className="panel p-5 type-small text-muted-foreground">
				{m.reviews_sign_in_prompt()}{" "}
				<TextLink inline to="/account/sign-in" className="text-foreground">
					{m.store_sign_in()}
				</TextLink>
			</p>
		);
	const reviewable = mine.data?.find((p) => p.slug === slug);
	if (mine.isPending) return null;
	if (!reviewable)
		return (
			<p className="panel p-5 type-small text-muted-foreground">
				{m.reviews_only_buyers()}
			</p>
		);
	return (
		<div className="panel p-5">
			<h3 className="type-h4">
				{reviewable.review ? m.reviews_edit_title() : m.reviews_write_title()}
			</h3>
			<p className="mt-1 type-meta text-muted-foreground">
				{reviewable.review
					? reviewStatusText[reviewable.review.status]()
					: m.reviews_write_body({ product: name })}
			</p>
			<ReviewEditor product={reviewable} className="mt-4" />
		</div>
	);
}

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
			<output
				className={cn("panel block p-4 type-small text-success", className)}
			>
				{m.stock_alert_done({ email })}
			</output>
		);
	return (
		<form
			id="stock-alert"
			className={cn("panel grid gap-3 p-4", className)}
			onSubmit={(e) => {
				e.preventDefault();
				request.mutate();
			}}
		>
			<div className="flex items-start gap-3">
				<BellRing aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
				<div>
					<p className="type-h4">{m.stock_alert_title()}</p>
					<p className="type-small text-muted-foreground">
						{m.stock_alert_body()}
					</p>
				</div>
			</div>
			<Field className="gap-1.5">
				<FieldLabel htmlFor="stock-alert-email">
					{m.checkout_email()}
				</FieldLabel>
				<div className="flex gap-2 max-sm:flex-col">
					<Input
						id="stock-alert-email"
						type="email"
						inputMode="email"
						autoComplete="email"
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						aria-invalid={fieldError ? true : undefined}
						className="h-(--control-lg) rounded-full bg-background px-4"
					/>
					<StoreButton type="submit" pending={request.isPending}>
						{m.stock_alert_submit()}
					</StoreButton>
				</div>
				{fieldError && <FieldError>{fieldError}</FieldError>}
			</Field>
		</form>
	);
}
