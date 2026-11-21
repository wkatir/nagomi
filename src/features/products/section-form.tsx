import type { ReactNode } from "react";
import { FormError, SubmitButton } from "#/components/admin/form/fields";
import { useFormContext } from "#/components/admin/form/form-context";
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
	const form = useFormContext();
	return (
		<div className="grid gap-3 border-t p-admin-card">
			<FormError />
			<div className="flex justify-end">
				<form.Subscribe selector={(state) => state.isDefaultValue}>
					{(unchanged) => (
						<SubmitButton disabled={unchanged}>{m.admin_save()}</SubmitButton>
					)}
				</form.Subscribe>
			</div>
		</div>
	);
}
