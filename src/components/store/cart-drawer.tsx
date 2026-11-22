import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
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
import { Sheet, SheetClose } from "#/components/ui/sheet";
import { Spinner } from "#/components/ui/spinner";
import { useMoney } from "#/hooks/use-money";
import { useCart, useCartCount } from "#/lib/cart";
import { cartDrawer, useCartDrawerOpen } from "#/lib/cart-ui";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";
import { CartLines } from "./cart-lines";
import { FreeShippingProgress } from "./cart-totals";

export function CartButton() {
	const count = useCartCount();
	const onCartPage = useRouterState({
		select: (s) => s.location.pathname === "/cart",
	});
	return (
		<StoreIconButton asChild className="relative">
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
				<ShoppingCart aria-hidden className="size-6" />
				<span
					aria-hidden
					className="absolute top-0.5 right-0 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-[#ecebff] px-1 text-[0.6875rem] font-semibold text-[#0d0d17] tabular-nums"
				>
					{count}
				</span>
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
	const cart = useCart();
	const lines = cart.data?.lines ?? [];
	const count = cart.data?.count ?? 0;

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
					<SheetClose asChild>
						<StoreButton asChild>
							<Link to="/products">{m.home_cta_shop()}</Link>
						</StoreButton>
					</SheetClose>
				</EmptyState>
			) : (
				<>
					<FreeShippingProgress
						cart={cart.data}
						className="shrink-0 border-b px-5 py-4"
					/>
					<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
						<CartLines lines={lines} />
					</div>
					<div className="shrink-0 border-t px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
						<dl className="grid gap-1">
							<div className="flex justify-between">
								<dt>{m.cart_subtotal()}</dt>
								<dd className="font-semibold tabular-nums">
									{money(cart.data.subtotal - cart.data.discount)}
								</dd>
							</div>
							<div className="flex justify-between gap-4 type-small text-muted-foreground">
								<dt>{m.cart_shipping()}</dt>
								<dd className="text-right">{m.cart_shipping_pending()}</dd>
							</div>
						</dl>
						{cart.data.hasProblems && (
							<p role="alert" className="mt-3 type-small text-destructive">
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
