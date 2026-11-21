import type { FormEventHandler, ReactNode } from "react";
import { Panel } from "#/components/admin/panel";

export function FormCard({
	title,
	description,
	onSubmit,
	footer,
	children,
}: {
	title: string;
	description?: string;
	onSubmit: FormEventHandler<HTMLFormElement>;
	footer: ReactNode;
	children: ReactNode;
}) {
	return (
		<Panel>
			<header className="grid gap-1 border-b px-admin-card py-3">
				<h2 className="type-ui font-bold">{title}</h2>
				{description && (
					<p className="type-small text-muted-foreground">{description}</p>
				)}
			</header>
			<form noValidate onSubmit={onSubmit}>
				<div className="grid gap-4 p-admin-card">{children}</div>
				<footer className="flex flex-wrap items-center justify-end gap-2 border-t px-admin-card py-3">
					{footer}
				</footer>
			</form>
		</Panel>
	);
}
