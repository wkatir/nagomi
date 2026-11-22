import type {
	RegisteredRouter,
	ValidateLinkOptions,
} from "@tanstack/react-router";
import { cn } from "cn";
import { ArrowRight } from "lucide-react";
import type * as React from "react";
import { TextLink } from "./text-link";

export type SectionHeadingProps<
	TRouter extends RegisteredRouter = RegisteredRouter,
	TOptions = unknown,
> = {
	title: string;
	body?: string;
	action?: { label: string; link: ValidateLinkOptions<TRouter, TOptions> };
	id?: string;
	className?: string;
};

export function SectionHeading<TRouter extends RegisteredRouter, TOptions>(
	props: SectionHeadingProps<TRouter, TOptions>,
): React.ReactNode;
export function SectionHeading({
	title,
	body,
	action,
	id,
	className,
}: SectionHeadingProps): React.ReactNode {
	return (
		<div
			className={cn(
				"flex items-end justify-between gap-x-6 gap-y-2 max-md:flex-wrap",
				className,
			)}
		>
			<div className="min-w-0">
				<h2 id={id} className="type-h2 text-balance">
					{title}
				</h2>
				{body && (
					<p className="mt-1.5 max-w-[60ch] type-small text-muted-foreground">
						{body}
					</p>
				)}
			</div>
			{action && (
				<TextLink
					{...action.link}
					variant="nav"
					className="group/action shrink-0 gap-1.5 type-meta font-medium text-brand hover:text-primary"
				>
					{action.label}
					<ArrowRight
						aria-hidden
						className="size-4 transition-transform group-hover/action:translate-x-0.5"
					/>
				</TextLink>
			)}
		</div>
	);
}
