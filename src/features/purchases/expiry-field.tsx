import { useId } from "react";
import { Field } from "#/components/admin/field";
import { useFieldContext } from "#/components/admin/form/form-context";
import { Input } from "#/components/ui/input";
import { m } from "#/paraglide/messages";
import { formatExpiryInput } from "./expiry-input";

// A day (2027-05-31) or, when the label only prints the month, a month (2027-05).
export function ExpiryField({ label }: { label: string }) {
	const field = useFieldContext<string>();
	const id = useId();
	const [first] = field.state.meta.errors;
	const error =
		field.state.meta.isTouched && first !== undefined
			? typeof first === "string"
				? first
				: (first as { message: string }).message
			: undefined;
	return (
		<Field id={id} label={label} error={error}>
			<Input
				id={id}
				name={field.name}
				inputMode="numeric"
				autoComplete="off"
				placeholder={m.admin_purchase_expiry_placeholder()}
				value={field.state.value}
				onBlur={field.handleBlur}
				onChange={(event) =>
					field.handleChange(formatExpiryInput(event.target.value))
				}
			/>
		</Field>
	);
}
