import { cn } from "cn";
import type * as React from "react";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { m } from "#/paraglide/messages";

type StoreButtonProps = Omit<
	React.ComponentProps<typeof Button>,
	"variant" | "size"
> & {
	variant?: "solid" | "outline" | "link";
	size?: "sm" | "md" | "lg";
	fullWidth?: boolean;
	pending?: boolean;
};

const variants = {
	solid: {
		variant: "default",
		className:
			"rounded-full bg-primary-gradient text-primary-foreground hover:bg-primary/90 hover:brightness-110",
	},
	outline: {
		variant: "outline",
		className:
			"rounded-full border-input bg-transparent text-foreground hover:border-primary hover:bg-accent",
	},
	link: {
		variant: "link",
		className:
			"px-0 font-normal text-foreground underline decoration-1 underline-offset-4 hover:decoration-2",
	},
} as const;

const sizes = {
	sm: "h-9 px-4 type-small has-[>svg]:px-4",
	md: "h-(--control-lg) px-6 has-[>svg]:px-6",
	lg: "h-(--control-xl) px-8 has-[>svg]:px-8",
} as const;

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
			className={cn(
				"size-(--control-lg) rounded-full",
				variant === "outline" && "border-input bg-card hover:bg-accent",
				className,
			)}
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
				"type-ui font-semibold",
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
