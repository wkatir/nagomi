import { cn } from "cn";
import { X } from "lucide-react";
import type * as React from "react";
import { SheetClose, SheetContent, SheetTitle } from "#/components/ui/sheet";
import { m } from "#/paraglide/messages";
import { StoreIconButton } from "./store-button";

// StoreSheetHeader draws the close button as a store button, so the generated one stays off.
export function StoreSheetContent({
	side,
	className,
	...props
}: Omit<
	React.ComponentProps<typeof SheetContent>,
	"side" | "showCloseButton"
> & {
	side: "left" | "right";
}) {
	return (
		<SheetContent
			side={side}
			showCloseButton={false}
			aria-describedby={undefined}
			className={cn(
				"h-dvh w-full gap-0 outline-none data-[state=closed]:duration-200 data-[state=open]:duration-200 sm:max-w-[420px]",
				side === "left" ? "border-r-0 sm:border-r" : "border-l-0 sm:border-l",
				className,
			)}
			{...props}
		/>
	);
}

// Height and padding come from the caller: the menu and the cart differ.
export function StoreSheetHeader({
	title,
	className,
}: {
	title: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex shrink-0 items-center justify-between border-b",
				className,
			)}
		>
			<SheetTitle className="type-title">{title}</SheetTitle>
			<SheetClose asChild>
				<StoreIconButton aria-label={m.close()} className="-mr-2.5">
					<X aria-hidden className="size-5" />
				</StoreIconButton>
			</SheetClose>
		</div>
	);
}
