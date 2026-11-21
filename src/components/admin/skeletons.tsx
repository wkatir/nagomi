import { Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { Skeleton } from "#/components/ui/skeleton";
import { m } from "#/paraglide/messages";

export function DetailSkeleton() {
	return (
		<div aria-busy className="grid gap-admin-section">
			<div className="flex items-center justify-between gap-4">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-9 w-32" />
			</div>
			<Skeleton className="h-48 w-full" />
			<Skeleton className="h-32 w-full" />
		</div>
	);
}

export function RecordNotFound({ listLabel }: { listLabel: string }) {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>{m.error_not_found()}</EmptyTitle>
			</EmptyHeader>
			<EmptyContent>
				<Button variant="outline" asChild>
					<Link to="..">{listLabel}</Link>
				</Button>
			</EmptyContent>
		</Empty>
	);
}
