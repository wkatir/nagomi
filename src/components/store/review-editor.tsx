import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { Star } from "lucide-react";
import { useId, useState } from "react";
import { StoreButton } from "#/components/store/ui/store-button";
import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { api, parseResponse } from "#/lib/api";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";

export type Reviewable = {
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

export const reviewStatusText = {
	pending: m.reviews_status_pending,
	approved: m.reviews_status_approved,
	rejected: m.reviews_status_rejected,
} as const;

export const myReviewsQueryKey = ["account", "reviews"] as const;

export function ReviewEditor({
	product,
	className,
}: {
	product: Reviewable;
	className?: string;
}) {
	const id = useId();
	const queryClient = useQueryClient();
	const [rating, setRating] = useState(product.review?.rating ?? 5);
	const [title, setTitle] = useState(product.review?.title ?? "");
	const [body, setBody] = useState(product.review?.body ?? "");
	const [tried, setTried] = useState(false);
	const save = useMutation({
		mutationFn: () =>
			parseResponse(
				api().account.reviews[":slug"].$put({
					param: { slug: product.slug },
					json: { rating, title: title.trim(), body: body.trim() },
				}),
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: myReviewsQueryKey }),
	});
	const titleError = tried && !title.trim() ? m.reviews_error_title() : null;
	const bodyError = tried && !body.trim() ? m.reviews_error_body() : null;
	return (
		<form
			noValidate
			className={cn("grid gap-4", className)}
			onSubmit={(e) => {
				e.preventDefault();
				setTried(true);
				if (title.trim() && body.trim()) save.mutate();
			}}
		>
			<Field className="gap-2">
				<FieldLabel id={`${id}-rating`}>{m.reviews_rating()}</FieldLabel>
				<ToggleGroup
					type="single"
					value={String(rating)}
					onValueChange={(v) => v && setRating(Number(v))}
					aria-labelledby={`${id}-rating`}
					className="gap-1"
				>
					{[1, 2, 3, 4, 5].map((n) => (
						<ToggleGroupItem
							key={n}
							value={String(n)}
							aria-label={m.reviews_stars({ count: n })}
							className="size-10 rounded-full px-0 hover:bg-accent data-[state=on]:bg-transparent"
						>
							<Star
								aria-hidden
								className={cn(
									"size-6",
									n <= rating
										? "fill-[#f5c84b] text-[#f5c84b]"
										: "text-muted-foreground",
								)}
							/>
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</Field>
			<Field className="gap-1.5">
				<FieldLabel htmlFor={`${id}-title`}>
					{m.reviews_review_title()}
				</FieldLabel>
				<Input
					id={`${id}-title`}
					value={title}
					maxLength={120}
					aria-invalid={titleError ? true : undefined}
					onChange={(e) => setTitle(e.target.value)}
					className="h-(--control-lg)"
				/>
				{titleError && <FieldError>{titleError}</FieldError>}
			</Field>
			<Field className="gap-1.5">
				<FieldLabel htmlFor={`${id}-body`}>{m.reviews_body()}</FieldLabel>
				<Textarea
					id={`${id}-body`}
					value={body}
					maxLength={2000}
					rows={4}
					aria-invalid={bodyError ? true : undefined}
					onChange={(e) => setBody(e.target.value)}
				/>
				{bodyError && <FieldError>{bodyError}</FieldError>}
			</Field>
			{save.isError && <FieldError>{errorMessage(save.error)}</FieldError>}
			{save.isSuccess && (
				<output className="block type-small text-success">
					{m.reviews_saved()}
				</output>
			)}
			<StoreButton
				type="submit"
				variant="outline"
				pending={save.isPending}
				className="justify-self-start"
			>
				{m.reviews_save()}
			</StoreButton>
		</form>
	);
}
