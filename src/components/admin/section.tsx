import type { ReactNode } from "react";
import { Panel } from "#/components/admin/panel";

export function Section({
	title,
	description,
	action,
	children,
}: {
	title: ReactNode;
	description?: ReactNode;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<Panel>
			<header className="flex min-h-admin-header flex-wrap items-center justify-between gap-2 border-b px-admin-card py-2">
				<div className="grid min-w-0">
					<h2 className="type-ui font-bold">{title}</h2>
					{description && (
						<p className="type-meta text-muted-foreground">{description}</p>
					)}
				</div>
				{action}
			</header>
			{children}
		</Panel>
	);
}

export const Fact = ({ label, value }: { label: string; value: ReactNode }) =>
	value ? (
		<div className="grid gap-0.5">
			<dt className="type-meta text-muted-foreground">{label}</dt>
			<dd className="type-small wrap-anywhere whitespace-pre-line">{value}</dd>
		</div>
	) : null;
