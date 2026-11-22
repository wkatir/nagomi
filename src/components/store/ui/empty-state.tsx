import { cn } from "cn";
import { PackageSearch } from "lucide-react";
import type * as React from "react";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty";

export function EmptyState({
	title,
	description,
	children,
	className,
}: {
	title: string;
	description?: string;
	children?: React.ReactNode;
	className?: string;
}) {
	return (
		<Empty className={cn("panel border-solid py-12", className)}>
			<EmptyHeader>
				<EmptyMedia
					variant="icon"
					className="size-12 rounded-full bg-accent text-brand"
				>
					<PackageSearch aria-hidden className="size-6" />
				</EmptyMedia>
				<EmptyTitle className="type-h3">{title}</EmptyTitle>
				{description && (
					<EmptyDescription className="type-small text-muted-foreground">
						{description}
					</EmptyDescription>
				)}
			</EmptyHeader>
			{children && <EmptyContent>{children}</EmptyContent>}
		</Empty>
	);
}
