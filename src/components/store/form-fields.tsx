import { cn } from "cn";
import type * as React from "react";
import { Checkbox } from "#/components/ui/checkbox";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "#/components/ui/input-group";
import {
	NativeSelect,
	NativeSelectOption,
} from "#/components/ui/native-select";
import { SV_LOCATIONS } from "#/lib/sv-locations";
import { m } from "#/paraglide/messages";

export const control =
	"h-(--control-lg) rounded-lg bg-background type-body md:type-ui";

const describedBy = (...ids: (string | false | null | undefined)[]) =>
	ids.filter(Boolean).join(" ") || undefined;

export function TextField({
	id,
	label,
	value,
	onChange,
	error,
	hint,
	className,
	...props
}: {
	id: string;
	label: string;
	value: string;
	onChange: (v: string) => void;
	error?: string | null;
	hint?: string;
	className?: string;
} & Omit<
	React.ComponentProps<typeof Input>,
	"onChange" | "value" | "id" | "className"
>) {
	return (
		<Field className={cn("gap-1.5", className)}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Input
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				aria-invalid={error ? true : undefined}
				aria-describedby={describedBy(
					hint && `${id}-hint`,
					error && `${id}-error`,
				)}
				className={control}
				{...props}
			/>
			{hint && (
				<FieldDescription id={`${id}-hint`} className="type-meta">
					{hint}
				</FieldDescription>
			)}
			{error && <FieldError id={`${id}-error`}>{error}</FieldError>}
		</Field>
	);
}

export function PhoneField({
	id,
	label,
	value,
	onChange,
	error,
	hint,
	required,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (v: string) => void;
	error?: string | null;
	hint?: string;
	required?: boolean;
}) {
	return (
		<Field className="gap-1.5">
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<InputGroup className="h-(--control-lg) rounded-lg bg-background">
				<InputGroupAddon>
					<InputGroupText className="text-foreground-secondary">
						+503
					</InputGroupText>
				</InputGroupAddon>
				<InputGroupInput
					id={id}
					type="tel"
					inputMode="numeric"
					autoComplete="tel-national"
					maxLength={9}
					placeholder="7123 4567"
					required={required}
					value={value}
					onChange={(e) => onChange(e.target.value.replace(/[^\d ]/g, ""))}
					aria-invalid={error ? true : undefined}
					aria-describedby={describedBy(
						hint && `${id}-hint`,
						error && `${id}-error`,
					)}
					className="type-body tabular-nums md:type-ui"
				/>
			</InputGroup>
			{hint && (
				<FieldDescription id={`${id}-hint`} className="type-meta">
					{hint}
				</FieldDescription>
			)}
			{error && <FieldError id={`${id}-error`}>{error}</FieldError>}
		</Field>
	);
}

export function LocationFields({
	idPrefix,
	department,
	municipality,
	onDepartment,
	onMunicipality,
	errors = {},
	required,
	className,
}: {
	idPrefix: string;
	department: string;
	municipality: string;
	onDepartment: (v: string) => void;
	onMunicipality: (v: string) => void;
	errors?: { department?: string | null; municipality?: string | null };
	required?: boolean;
	className?: string;
}) {
	const municipalities =
		SV_LOCATIONS.find((l) => l.department === department)?.municipalities ?? [];
	return (
		<div className={cn("grid gap-4 sm:grid-cols-2", className)}>
			<Field className="gap-1.5">
				<FieldLabel htmlFor={`${idPrefix}-department`}>
					{m.checkout_department()}
				</FieldLabel>
				<NativeSelect
					id={`${idPrefix}-department`}
					value={department}
					required={required}
					onChange={(e) => {
						onDepartment(e.target.value);
						onMunicipality("");
					}}
					aria-invalid={errors.department ? true : undefined}
					aria-describedby={
						errors.department ? `${idPrefix}-department-error` : undefined
					}
					className={control}
				>
					<NativeSelectOption value="">
						{m.checkout_choose()}
					</NativeSelectOption>
					{SV_LOCATIONS.map((l) => (
						<NativeSelectOption key={l.department} value={l.department}>
							{l.department}
						</NativeSelectOption>
					))}
				</NativeSelect>
				{errors.department && (
					<FieldError id={`${idPrefix}-department-error`}>
						{errors.department}
					</FieldError>
				)}
			</Field>
			<Field className="gap-1.5">
				<FieldLabel htmlFor={`${idPrefix}-municipality`}>
					{m.checkout_municipality()}
				</FieldLabel>
				<NativeSelect
					id={`${idPrefix}-municipality`}
					value={municipality}
					required={required}
					disabled={!department}
					onChange={(e) => onMunicipality(e.target.value)}
					aria-invalid={errors.municipality ? true : undefined}
					aria-describedby={
						errors.municipality ? `${idPrefix}-municipality-error` : undefined
					}
					className={control}
				>
					<NativeSelectOption value="">
						{m.checkout_choose()}
					</NativeSelectOption>
					{municipalities.map((name) => (
						<NativeSelectOption key={name} value={name}>
							{name}
						</NativeSelectOption>
					))}
				</NativeSelect>
				{errors.municipality && (
					<FieldError id={`${idPrefix}-municipality-error`}>
						{errors.municipality}
					</FieldError>
				)}
			</Field>
		</div>
	);
}

export function ConsentField({
	id,
	checked,
	onChange,
	error,
	children,
}: {
	id: string;
	checked: boolean;
	onChange: (v: boolean) => void;
	error?: string | null;
	children: React.ReactNode;
}) {
	return (
		<div>
			<Field orientation="horizontal" className="items-start gap-3">
				<Checkbox
					id={id}
					checked={checked}
					onCheckedChange={(c) => onChange(c === true)}
					aria-invalid={error ? true : undefined}
					aria-describedby={error ? `${id}-error` : undefined}
					className="tap-area mt-0.5 size-[1.125rem] rounded-[0.3rem]"
				/>
				<FieldLabel
					htmlFor={id}
					className="block type-small leading-relaxed font-normal text-foreground-secondary"
				>
					{children}
				</FieldLabel>
			</Field>
			{error && (
				<FieldError id={`${id}-error`} className="mt-1 ml-7">
					{error}
				</FieldError>
			)}
		</div>
	);
}
