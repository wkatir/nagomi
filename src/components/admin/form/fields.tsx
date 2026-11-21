import { type ComponentProps, useId } from "react";
import { Field } from "#/components/admin/field";
import { MoneyInput } from "#/components/admin/money-input";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "#/components/ui/native-select";
import { Spinner } from "#/components/ui/spinner";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { useFieldContext, useFormContext } from "./form-context";

// Schema issues carry a `message`; the ones the API returned are text already.
const textOf = (error: unknown) =>
	typeof error === "string" ? error : (error as { message: string }).message;

// Shown only once the field was touched or the form submitted, so a form does not open covered
// in errors.
function useFieldError() {
	const { meta } = useFieldContext<unknown>().state;
	const [first] = meta.errors;
	return meta.isTouched && first !== undefined ? textOf(first) : undefined;
}

type Owned = "id" | "name" | "value" | "onChange" | "onBlur";

export function TextField({
	label,
	...control
}: { label: string } & Omit<ComponentProps<typeof Input>, Owned>) {
	const field = useFieldContext<string>();
	const id = useId();
	return (
		<Field id={id} label={label} error={useFieldError()}>
			<Input
				{...control}
				id={id}
				name={field.name}
				value={field.state.value}
				onBlur={field.handleBlur}
				onChange={(event) => field.handleChange(event.target.value)}
			/>
		</Field>
	);
}

export function TextareaField({
	label,
	...control
}: { label: string } & Omit<ComponentProps<typeof Textarea>, Owned>) {
	const field = useFieldContext<string>();
	const id = useId();
	return (
		<Field id={id} label={label} error={useFieldError()}>
			<Textarea
				{...control}
				id={id}
				name={field.name}
				value={field.state.value}
				onBlur={field.handleBlur}
				onChange={(event) => field.handleChange(event.target.value)}
			/>
		</Field>
	);
}

export function MoneyField({ label }: { label: string }) {
	const field = useFieldContext<string>();
	const id = useId();
	return (
		<Field id={id} label={label} error={useFieldError()}>
			<MoneyInput
				id={id}
				name={field.name}
				value={field.state.value}
				onBlur={field.handleBlur}
				onChange={(event) => field.handleChange(event.target.value)}
			/>
		</Field>
	);
}

export function SelectField({
	label,
	options,
	disabled,
}: {
	label: string;
	options: readonly { value: string; label: string }[];
	disabled?: boolean;
}) {
	const field = useFieldContext<string>();
	const id = useId();
	return (
		<Field id={id} label={label} error={useFieldError()}>
			<NativeSelect
				id={id}
				name={field.name}
				disabled={disabled}
				value={field.state.value}
				onBlur={field.handleBlur}
				onChange={(event) => field.handleChange(event.target.value)}
			>
				{options.map((option) => (
					<NativeSelectOption key={option.value} value={option.value}>
						{option.label}
					</NativeSelectOption>
				))}
			</NativeSelect>
		</Field>
	);
}

export function CheckboxField({ label }: { label: string }) {
	const field = useFieldContext<boolean>();
	const id = useId();
	return (
		<Field
			id={id}
			label={label}
			orientation="horizontal"
			error={useFieldError()}
		>
			<Checkbox
				id={id}
				name={field.name}
				checked={field.state.value}
				onBlur={field.handleBlur}
				onCheckedChange={(checked) => field.handleChange(checked === true)}
				className="rounded-sm"
			/>
		</Field>
	);
}

export function SwitchField({ label }: { label: string }) {
	const field = useFieldContext<boolean>();
	const id = useId();
	return (
		<Field
			id={id}
			label={label}
			orientation="horizontal"
			error={useFieldError()}
		>
			<Switch
				id={id}
				name={field.name}
				checked={field.state.value}
				onBlur={field.handleBlur}
				onCheckedChange={field.handleChange}
			/>
		</Field>
	);
}

export function DateField({ label }: { label: string }) {
	const field = useFieldContext<string>();
	const id = useId();
	return (
		<Field id={id} label={label} error={useFieldError()}>
			<Input
				id={id}
				type="date"
				name={field.name}
				value={field.state.value}
				onBlur={field.handleBlur}
				onChange={(event) => field.handleChange(event.target.value)}
			/>
		</Field>
	);
}

export function SubmitButton({
	children,
	...props
}: Omit<ComponentProps<typeof Button>, "type">) {
	const form = useFormContext();
	return (
		<form.Subscribe selector={(state) => state.isSubmitting}>
			{(submitting) => (
				<Button
					{...props}
					type="submit"
					disabled={submitting || props.disabled}
				>
					{submitting && <Spinner aria-hidden />}
					{children}
				</Button>
			)}
		</form.Subscribe>
	);
}

// The schema issues that belong to no field (a sale with no lines) are the form's, so they are
// worked out again at every submit; on a field they would stay and stop the next submit until
// that field itself changed.
export function FormError() {
	const form = useFormContext();
	return (
		<form.Subscribe selector={(state) => state.errors}>
			{(errors) => {
				const message = errors
					.flatMap((error) => {
						if (typeof error === "string") return [error];
						// A form schema's issues come keyed by field path; "" holds the ones with no path.
						const issues =
							typeof error === "object" && error !== null
								? (error as Record<string, { message: string }[] | undefined>)[
										""
									]
								: undefined;
						return issues?.map((issue) => issue.message) ?? [];
					})
					.at(0);
				return message ? (
					<Alert variant="destructive">
						<AlertDescription>{message}</AlertDescription>
					</Alert>
				) : null;
			}}
		</form.Subscribe>
	);
}
