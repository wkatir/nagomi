import type { ReactNode } from "react";
import { FormError, SaveButton } from "#/components/admin/form/fields";
import { m } from "#/paraglide/messages";

export function SectionForm({
	onSubmit,
	children,
}: {
	onSubmit: () => void;
	children: ReactNode;
}) {
	return (
		<form
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			{children}
		</form>
	);
}

export function SectionFooter() {
	return (
		<div className="grid gap-3 border-t p-admin-card">
			<FormError />
			<div className="flex justify-end">
				<SaveButton>{m.admin_save()}</SaveButton>
			</div>
		</div>
	);
}
