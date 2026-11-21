import { Panel } from "#/components/admin/panel";
import { Skeleton } from "#/components/ui/skeleton";

export function SettingsSkeleton({ cards = 2 }: { cards?: number }) {
	return (
		<div aria-busy className="grid gap-admin-stack">
			{Array.from({ length: cards }, (_, n) => `card-${n}`).map((key) => (
				<Panel key={key}>
					<div className="border-b px-admin-card py-3">
						<Skeleton className="h-5 w-40" />
					</div>
					<div className="grid gap-4 p-admin-card sm:grid-cols-2">
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-9 w-full" />
					</div>
					<div className="flex justify-end border-t px-admin-card py-3">
						<Skeleton className="h-9 w-20" />
					</div>
				</Panel>
			))}
		</div>
	);
}
