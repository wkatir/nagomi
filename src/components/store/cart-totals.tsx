import { cn } from "cn";
import { Truck } from "lucide-react";
import { useState } from "react";
import { StoreButton } from "#/components/store/ui/store-button";
import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Progress } from "#/components/ui/progress";
import { useMoney } from "#/hooks/use-money";
import { apiErrorOf } from "#/lib/api";
import { type Cart, useCartActions } from "#/lib/cart";
import { errorMessage, promotionReasonMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";

const percent = (bp: number) => `${bp / 100} %`;

export function CartTotals({
	cart,
	className,
}: {
	cart: Cart;
	className?: string;
}) {
	const money = useMoney();
	const coupon = cart.coupon;
	return (
		<dl className={cn("grid gap-2.5 type-small", className)}>
			<div className="flex justify-between gap-4">
				<dt className="text-foreground-secondary">{m.cart_subtotal()}</dt>
				<dd className="tabular-nums">{money(cart.subtotal)}</dd>
			</div>
			{coupon?.valid && (
				<div className="flex justify-between gap-4 text-success">
					<dt>{m.cart_discount({ code: coupon.code })}</dt>
					<dd className="tabular-nums">−{money(cart.discount)}</dd>
				</div>
			)}
			<div className="flex justify-between gap-4">
				<dt className="text-foreground-secondary">
					{cart.shippingQuote
						? m.checkout_shipping_to({ zone: cart.shippingQuote.name })
						: m.cart_shipping()}
				</dt>
				<dd className="text-right tabular-nums">
					{cart.shippingQuote
						? cart.shippingQuote.fee === 0
							? m.cart_shipping_free()
							: money(cart.shippingQuote.fee)
						: m.cart_shipping_at_checkout()}
				</dd>
			</div>
			<div className="mt-1 flex items-baseline justify-between gap-4 border-t pt-3.5">
				<dt className="type-body font-semibold">
					{cart.shippingQuote ? m.cart_total() : m.cart_total_before_shipping()}
				</dt>
				<dd className="text-xl font-semibold tabular-nums">
					{money(cart.total)}
				</dd>
			</div>
			<div className="type-meta text-muted-foreground">
				<dt>
					{m.cart_iva_included({
						rate: percent(cart.taxRateBp),
						amount: money(cart.taxIncluded),
					})}
				</dt>
			</div>
		</dl>
	);
}

export function FreeShippingProgress({
	cart,
	className,
}: {
	cart: Pick<Cart, "freeShippingFrom" | "freeShippingGap">;
	className?: string;
}) {
	const money = useMoney();
	const { freeShippingFrom: from, freeShippingGap: gap } = cart;
	if (from === null || gap === null) return null;
	const reached = gap === 0;
	return (
		<div className={cn("grid gap-2", className)}>
			<p className="flex items-center gap-2 type-small">
				<Truck aria-hidden className="size-4 shrink-0 text-brand" />
				{reached
					? m.cart_free_shipping_reached()
					: m.cart_free_shipping_gap({ amount: money(gap) })}
			</p>
			<Progress
				aria-hidden
				value={from > 0 ? Math.min(100, ((from - gap) / from) * 100) : 100}
				className="h-1.5 bg-muted [&>[data-slot=progress-indicator]]:bg-primary-gradient"
			/>
		</div>
	);
}

export function CouponForm({ cart }: { cart: Cart }) {
	const money = useMoney();
	const { applyCoupon, removeCoupon } = useCartActions();
	const [code, setCode] = useState("");
	const coupon = cart.coupon;
	const refused = apiErrorOf(applyCoupon.error);
	const message =
		refused?.code === "promotion_invalid"
			? promotionReasonMessage(
					String(refused.body.reason),
					typeof refused.body.minSubtotal === "number"
						? money(refused.body.minSubtotal)
						: null,
				)
			: applyCoupon.isError
				? errorMessage(applyCoupon.error)
				: null;
	if (coupon)
		return (
			<div className="grid gap-1 rounded-lg border border-dashed border-input p-3 type-small">
				{coupon.valid ? (
					<p className="text-success">
						{m.cart_coupon_applied({ code: coupon.code })}
						{coupon.description ? ` · ${coupon.description}` : ""}
					</p>
				) : (
					<p className="text-destructive">
						{coupon.code}:{" "}
						{promotionReasonMessage(
							coupon.reason,
							coupon.minSubtotal === null ? null : money(coupon.minSubtotal),
						)}
					</p>
				)}
				{coupon.valid && coupon.emailCheckPending && (
					<p className="text-muted-foreground">
						{m.cart_coupon_email_pending()}
					</p>
				)}
				<StoreButton
					variant="link"
					className="h-auto justify-start p-0 type-small"
					pending={removeCoupon.isPending}
					onClick={() => removeCoupon.mutate()}
				>
					{m.cart_coupon_remove()}
				</StoreButton>
			</div>
		);
	return (
		<form
			className="grid gap-1.5"
			onSubmit={(e) => {
				e.preventDefault();
				if (code.trim()) applyCoupon.mutate(code.trim());
			}}
		>
			<Field className="gap-1.5">
				<FieldLabel htmlFor="coupon" className="type-small">
					{m.cart_coupon_label()}
				</FieldLabel>
				<div className="flex gap-2">
					<Input
						id="coupon"
						value={code}
						onChange={(e) => setCode(e.target.value.toUpperCase())}
						autoComplete="off"
						maxLength={32}
						aria-invalid={message ? true : undefined}
						aria-describedby={message ? "coupon-error" : undefined}
						className="h-(--control-lg) rounded-full bg-background px-4 uppercase"
					/>
					<StoreButton
						type="submit"
						variant="outline"
						pending={applyCoupon.isPending}
					>
						{m.cart_coupon_apply()}
					</StoreButton>
				</div>
			</Field>
			{message && <FieldError id="coupon-error">{message}</FieldError>}
		</form>
	);
}
