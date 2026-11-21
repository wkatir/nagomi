import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Skeleton } from "#/components/ui/skeleton";
import { slideStatusLabel } from "#/features/slides/slide-status";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";
import { type MediaUsage, mediaUsageQuery } from "./queries";

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
	<div className="grid gap-1">
		<h3 className="type-meta text-muted-foreground">{title}</h3>
		<ul className="type-small grid gap-1">{children}</ul>
	</div>
);

const slideRole = ({ desktop, mobile }: MediaUsage["slides"][number]) =>
	[
		desktop && m.admin_library_as_desktop(),
		mobile && m.admin_library_as_mobile(),
	]
		.filter(Boolean)
		.join(", ");

export function UsageList({ usage }: { usage: MediaUsage }) {
	if (
		usage.slides.length === 0 &&
		usage.collections.length === 0 &&
		usage.photos.length === 0
	)
		return (
			<p className="type-small text-muted-foreground">
				{m.admin_library_unused()}
			</p>
		);
	return (
		<div className="grid gap-3">
			{usage.slides.length > 0 && (
				<Group title={m.admin_library_used_slides()}>
					{usage.slides.map((slide) => (
						<li key={slide.id}>
							<Link
								to="/admin/slides/$id"
								params={{ id: slide.id }}
								className="font-medium underline-offset-4 hover:underline"
							>
								{slide.title ?? m.admin_slide_untitled()}
							</Link>
							<span className="text-muted-foreground">
								{" "}
								· {slideRole(slide)} · {slideStatusLabel[slide.status]()}
							</span>
						</li>
					))}
				</Group>
			)}
			{usage.collections.length > 0 && (
				<Group title={m.admin_library_used_covers()}>
					{usage.collections.map((collection) => (
						<li key={collection.id}>
							<span className="font-medium">
								{collection.title ?? collection.slug}
							</span>
							<span className="text-muted-foreground">
								{" "}
								· {slideStatusLabel[collection.status]()}
							</span>
						</li>
					))}
				</Group>
			)}
			{usage.photos.length > 0 && (
				<Group title={m.admin_library_used_photos()}>
					{usage.photos.map((photo) => (
						<li key={photo.id}>
							<span className="font-medium">{photo.name ?? photo.slug}</span>
							{photo.status === "archived" && (
								<span className="text-muted-foreground">
									{" "}
									· {m.admin_library_photo_archived()}
								</span>
							)}
						</li>
					))}
				</Group>
			)}
		</div>
	);
}

export function ImageUsage({ id }: { id: number }) {
	const usage = useQuery(mediaUsageQuery(id));
	if (usage.isPending)
		return (
			<div aria-busy className="grid gap-2">
				<Skeleton className="h-4 w-40" />
				<Skeleton className="h-4 w-56" />
			</div>
		);
	if (usage.isError)
		return (
			<Alert variant="destructive">
				<AlertDescription>{errorMessage(usage.error)}</AlertDescription>
			</Alert>
		);
	return <UsageList usage={usage.data} />;
}
