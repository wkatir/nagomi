import { cn } from "cn";
import type * as React from "react";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { m } from "#/paraglide/messages";

// Spec: docs/strategy/DESIGN_SYSTEM.md.
type StoreButtonProps = Omit<
	React.ComponentProps<typeof Button>,
	"variant" | "size"
> & {
	variant?: "solid" | "outline" | "link";
	size?: "md" | "lg";
	fullWidth?: boolean;
	pending?: boolean;
};

const variants = {
	solid: { variant: "default", className: "" },
	outline: {
		variant: "outline",
		className:
			"border-foreground bg-transparent hover:bg-foreground hover:text-background",
	},
	link: {
		variant: "link",
		className:
			"px-0 font-normal underline decoration-1 underline-offset-4 hover:decoration-2",
	},
} as const;

const sizes = {
	md: "h-(--control-lg) px-6 has-[>svg]:px-6",
	lg: "h-(--control-xl) px-8 has-[>svg]:px-8",
} as const;

// Icon-only: always pass aria-label.
export function StoreIconButton({
	variant = "ghost",
	className,
	...props
}: Omit<React.ComponentProps<typeof Button>, "variant" | "size"> & {
	variant?: "ghost" | "outline";
}) {
	return (
		<Button
			variant={variant}
			size="icon"
			className={cn("size-(--control-lg)", className)}
			{...props}
		/>
	);
}

export function StoreButton({
	variant = "solid",
	size = "md",
	fullWidth,
	pending,
	asChild,
	disabled,
	className,
	children,
	...props
}: StoreButtonProps) {
	return (
		<Button
			variant={variants[variant].variant}
			asChild={asChild}
			disabled={disabled || pending}
			aria-busy={pending || undefined}
			className={cn(
				"type-body font-bold",
				sizes[size],
				variants[variant].className,
				fullWidth && "w-full",
				className,
			)}
			{...props}
		>
			{asChild ? (
				children
			) : (
				<>
					{pending && <Spinner aria-label={m.loading()} />}
					{children}
				</>
			)}
		</Button>
	);
}
