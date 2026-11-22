import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Stars } from "#/components/store/product-extras";
import { StoreButton } from "#/components/store/ui/store-button";
import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "#/components/ui/native-select";
import { Spinner } from "#/components/ui/spinner";
import { Textarea } from "#/components/ui/textarea";
import { api, parseResponse } from "#/lib/api";
import { authClient } from "#/lib/auth-client";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

export const Route = createFileRoute("/_store/account/reviews")({
	staticData: { noindex: true },
	head: () => ({ meta: [{ title: m.reviews_mine_title() }] }),
	component: MyReviews,
});

const statusText = {
	pending: m.reviews_status_pending,
	approved: m.reviews_status_approved,
	rejected: m.reviews_status_rejected,
} as const;

function MyReviews() {
	const session = authClient.useSession();
	const signedIn = session.data?.user.role === "customer";
	const locale = getLocale();
	const list = useQuery({
		queryKey: ["account", "reviews", locale],
		queryFn: () =>
			parseResponse(api().account.reviews.$get({ query: { locale } })),
		enabled: signedIn,
	});
	if (session.isPending || (signedIn && list.isPending))
		return (
			<div className="container-page py-16">
				<Spinner aria-label={m.loading()} className="text-muted-foreground" />
			</div>
		);
	if (!signedIn)
		return (
			<div className="container-page py-16">
				<StoreButton asChild>
					<Link to="/account/sign-in">{m.account_sign_in()}</Link>
				</StoreButton>
			</div>
		);
	return (
		<div className="container-page grid max-w-3xl gap-6 py-section-sm">
			<h1 className="type-h1">{m.reviews_mine_title()}</h1>
			<p className="text-foreground-secondary">{m.reviews_mine_body()}</p>
			{list.isError && <FieldError>{errorMessage(list.error)}</FieldError>}
			{list.data?.length === 0 && (
				<p className="text-muted-foreground">{m.reviews_none_to_write()}</p>
			)}
			{list.data?.map((p) => (
				<ReviewEditor key={p.productId} product={p} />
			))}
		</div>
	);
}

type Reviewable = {
	productId: number;
	slug: string;
	name: string;
	review: {
		rating: number;
		title: string;
		body: string;
		status: "pending" | "approved" | "rejected";
	} | null;
};

function ReviewEditor({ product }: { product: Reviewable }) {
	const queryClient = useQueryClient();
	const [rating, setRating] = useState(product.review?.rating ?? 5);
	const [title, setTitle] = useState(product.review?.title ?? "");
	const [body, setBody] = useState(product.review?.body ?? "");
	const save = useMutation({
		mutationFn: () =>
			parseResponse(
				api().account.reviews[":slug"].$put({
					param: { slug: product.slug },
					json: { rating, title, body },
				}),
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["account", "reviews"] }),
	});
	return (
		<form
			className="grid gap-3 border p-5"
			onSubmit={(e) => {
				e.preventDefault();
				save.mutate();
			}}
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<Link
					to="/products/$slug"
					params={{ slug: product.slug }}
					className="font-medium underline-offset-4 hover:underline"
				>
					{product.name}
				</Link>
				{product.review && (
					<span className="type-small text-muted-foreground">
						<Stars
							value={product.review.rating}
							className="mr-2 align-middle"
						/>
						{statusText[product.review.status]()}
					</span>
				)}
			</div>
			<Field className="gap-1.5">
				<FieldLabel htmlFor={`rating-${product.productId}`}>
					{m.reviews_rating()}
				</FieldLabel>
				<NativeSelect
					id={`rating-${product.productId}`}
					value={String(rating)}
					onChange={(e) => setRating(Number(e.target.value))}
				>
					{[5, 4, 3, 2, 1].map((n) => (
						<NativeSelectOption key={n} value={String(n)}>
							{"★".repeat(n)}
						</NativeSelectOption>
					))}
				</NativeSelect>
			</Field>
			<Field className="gap-1.5">
				<FieldLabel htmlFor={`title-${product.productId}`}>
					{m.reviews_review_title()}
				</FieldLabel>
				<Input
					id={`title-${product.productId}`}
					value={title}
					maxLength={120}
					required
					onChange={(e) => setTitle(e.target.value)}
				/>
			</Field>
			<Field className="gap-1.5">
				<FieldLabel htmlFor={`body-${product.productId}`}>
					{m.reviews_body()}
				</FieldLabel>
				<Textarea
					id={`body-${product.productId}`}
					value={body}
					maxLength={2000}
					required
					onChange={(e) => setBody(e.target.value)}
				/>
			</Field>
			{save.isError && <FieldError>{errorMessage(save.error)}</FieldError>}
			{save.isSuccess && (
				<p className="type-small text-success">{m.reviews_saved()}</p>
			)}
			<StoreButton
				type="submit"
				pending={save.isPending}
				className="justify-self-start"
			>
				{m.reviews_save()}
			</StoreButton>
		</form>
	);
}
