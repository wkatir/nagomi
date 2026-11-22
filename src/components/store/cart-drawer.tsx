import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { useEffect } from "react";
import { EmptyState } from "#/components/store/ui/empty-state";
import {
	StoreButton,
	StoreIconButton,
} from "#/components/store/ui/store-button";
import {
	StoreSheetContent,
	StoreSheetHeader,
} from "#/components/store/ui/store-sheet";
import { Badge } from "#/components/ui/badge";
import { Progress } from "#/components/ui/progress";
import { Sheet, SheetClose } from "#/components/ui/sheet";
import { Spinner } from "#/components/ui/spinner";
import { useMoney } from "#/hooks/use-money";
import { useCart, useCartCount } from "#/lib/cart";
import { cartDrawer, useCartDrawerOpen } from "#/lib/cart-ui";
import { errorMessage } from "#/lib/errors";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { CartLines } from "./cart-lines";
import { PaymentMethods } from "./payment-methods";

// A real link to /cart (works without JavaScript); once hydrated it opens the drawer.
export function CartButton() {
	const count = useCartCount();
	const onCartPage = useRouterState({
		select: (s) => s.location.pathname === "/cart",
	});
	return (
		<StoreIconButton asChild className="relative -mr-2.5">
			<Link
				to="/cart"
				aria-label={m.nav_cart({ count: count })}
				aria-haspopup={onCartPage ? undefined : "dialog"}
				onClick={(e) => {
					if (
						onCartPage ||
						e.button !== 0 ||
						e.metaKey ||
						e.ctrlKey ||
						e.shiftKey ||
						e.altKey
					)
						return;
					e.preventDefault();
					cartDrawer.open(e.currentTarget);
				}}
			>
				<ShoppingBag aria-hidden className="size-[22px]" />
				{count > 0 && (
					<Badge
						aria-hidden
						className="absolute top-0.5 right-0 h-5 min-w-5 rounded-sm px-1 font-bold tabular-nums"
					>
						{count}
					</Badge>
				)}
			</Link>
		</StoreIconButton>
	);
}

export function CartDrawer() {
	const open = useCartDrawerOpen();
	const router = useRouter();
	useEffect(
		() => router.subscribe("onBeforeNavigate", () => cartDrawer.close()),
		[router],
	);

	return (
		<Sheet open={open} onOpenChange={cartDrawer.setOpen}>
			<StoreSheetContent
				side="right"
				onCloseAutoFocus={(e) => {
					e.preventDefault();
					cartDrawer.restoreFocus();
				}}
			>
				<CartDrawerBody />
			</StoreSheetContent>
		</Sheet>
	);
}

function CartDrawerBody() {
	const money = useMoney();
	const { data: store } = useSuspenseQuery(storeQuery);
	const cart = useCart();
	const lines = cart.data?.lines ?? [];
	const count = cart.data?.count ?? 0;
	const subtotal = cart.data ? cart.data.subtotal - cart.data.discount : 0;
	const hasProblems = cart.data?.hasProblems ?? false;
	const threshold = store.freeShippingFrom;

	return (
		<>
			<StoreSheetHeader
				className="h-16 px-5"
				title={
					<>
						{m.cart_title()}
						{count > 0 && (
							<span className="ml-2 type-body font-normal text-muted-foreground tabular-nums">
								({count})
							</span>
						)}
					</>
				}
			/>

			{cart.isPending ? (
				<Spinner
					aria-label={m.loading()}
					className="m-5 text-muted-foreground"
				/>
			) : cart.isError ? (
				<p className="p-5 text-destructive">{errorMessage(cart.error)}</p>
			) : lines.length === 0 ? (
				<EmptyState title={m.cart_empty()} className="p-5">
					<StoreButton asChild>
						<Link to="/products">{m.home_cta_shop()}</Link>
					</StoreButton>
				</EmptyState>
			) : (
				<>
					{threshold != null && (
						<div className="shrink-0 border-b px-5 py-4">
							<p className="type-small">
								{subtotal >= threshold
									? m.cart_free_shipping_reached()
									: m.cart_free_shipping_gap({
											amount: money(threshold - subtotal),
										})}
							</p>
							<Progress
								aria-hidden
								value={
									threshold > 0
										? Math.min(100, (subtotal / threshold) * 100)
										: 100
								}
								className="mt-2.5 h-0.5 rounded-none bg-border"
							/>
						</div>
					)}
					<div className="min-h-0 flex-1 overflow-y-auto px-5">
						<CartLines lines={lines} className="border-t-0" />
					</div>
					<div className="shrink-0 border-t px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
						<dl className="grid gap-1">
							<div className="flex justify-between">
								<dt>{m.cart_subtotal()}</dt>
								<dd className="font-bold tabular-nums">{money(subtotal)}</dd>
							</div>
							<div className="flex justify-between type-small text-muted-foreground">
								<dt>{m.cart_shipping()}</dt>
								<dd>
									{threshold != null && subtotal >= threshold
										? m.cart_shipping_free()
										: m.cart_shipping_pending()}
								</dd>
							</div>
						</dl>
						<PaymentMethods methods={store.paymentMethods} className="mt-2" />
						{hasProblems && (
							<p className="mt-3 type-small text-destructive">
								{m.cart_adjust_stock()}
							</p>
						)}
						<StoreButton asChild size="lg" fullWidth className="mt-4">
							<Link to="/cart">{m.cart_finish()}</Link>
						</StoreButton>
						<SheetClose asChild>
							<StoreButton variant="link" className="mx-auto mt-1 flex">
								{m.cart_continue_shopping()}
							</StoreButton>
						</SheetClose>
					</div>
				</>
			)}
		</>
	);
}
