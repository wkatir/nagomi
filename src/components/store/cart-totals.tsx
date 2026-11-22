import { cn } from "cn";
import { useState } from "react";
import { StoreButton } from "#/components/store/ui/store-button";
import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { useMoney } from "#/hooks/use-money";
import { apiErrorOf } from "#/lib/api";
import { type Cart, useCartActions } from "#/lib/cart";
import { errorMessage, promotionReasonMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";

const percent = (bp: number) => `${bp / 100} %`;

// Every figure comes from the server: subtotal, coupon, shipping and the IVA included.
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
		<dl className={cn("grid gap-2 type-body", className)}>
			<div className="flex justify-between">
				<dt>{m.cart_subtotal()}</dt>
				<dd className="tabular-nums">{money(cart.subtotal)}</dd>
			</div>
			{coupon?.valid && (
				<div className="flex justify-between text-success">
					<dt>{m.cart_discount({ code: coupon.code })}</dt>
					<dd className="tabular-nums">−{money(cart.discount)}</dd>
				</div>
			)}
			<div className="flex justify-between">
				<dt>
					{cart.shippingQuote
						? m.checkout_shipping_to({ zone: cart.shippingQuote.name })
						: m.cart_shipping()}
				</dt>
				<dd className="tabular-nums">
					{cart.shippingQuote
						? cart.shippingQuote.fee === 0
							? m.cart_shipping_free()
							: money(cart.shippingQuote.fee)
						: m.cart_shipping_at_checkout()}
				</dd>
			</div>
			<div className="flex justify-between border-t pt-2 font-bold">
				<dt>
					{cart.shippingQuote ? m.cart_total() : m.cart_total_before_shipping()}
				</dt>
				<dd className="tabular-nums">{money(cart.total)}</dd>
			</div>
			<div className="flex justify-between type-small text-muted-foreground">
				<dt>
					{m.cart_iva_included({
						rate: percent(cart.taxRateBp),
						amount: money(cart.taxIncluded),
					})}
				</dt>
			</div>
			{cart.freeShippingGap !== null && cart.freeShippingGap > 0 && (
				<p className="type-small text-muted-foreground">
					{m.cart_free_shipping_gap({ amount: money(cart.freeShippingGap) })}
				</p>
			)}
		</dl>
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
			<div className="grid gap-1 type-small">
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
					className="h-auto justify-start p-0"
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
				<FieldLabel htmlFor="coupon">{m.cart_coupon_label()}</FieldLabel>
				<div className="flex gap-2">
					<Input
						id="coupon"
						value={code}
						onChange={(e) => setCode(e.target.value.toUpperCase())}
						autoComplete="off"
						maxLength={32}
						aria-invalid={message ? true : undefined}
						aria-describedby={message ? "coupon-error" : undefined}
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
