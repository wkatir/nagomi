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
	/** Id for the heading, so the section can use aria-labelledby. */
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
				"flex items-end justify-between gap-x-8 gap-y-3 max-md:flex-wrap",
				className,
			)}
		>
			<div className="min-w-0">
				<h2 id={id} className="max-w-[22ch] type-h2 text-balance">
					{title}
				</h2>
				{body && (
					<p className="mt-3 max-w-[52ch] type-lead text-foreground-secondary">
						{body}
					</p>
				)}
			</div>
			{action && (
				<TextLink
					{...action.link}
					className="group/action shrink-0 gap-2 type-small font-medium"
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
