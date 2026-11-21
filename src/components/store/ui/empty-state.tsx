import type * as React from "react";
import {
	Empty,
	EmptyContent,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";

export function EmptyState({
	title,
	children,
	className,
}: {
	title: string;
	children?: React.ReactNode;
	className?: string;
}) {
	return (
		<Empty className={className}>
			<EmptyHeader>
				<EmptyTitle className="type-h3">{title}</EmptyTitle>
			</EmptyHeader>
			{children && <EmptyContent>{children}</EmptyContent>}
		</Empty>
	);
}
