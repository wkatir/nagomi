import { cloneElement, isValidElement, type ReactNode } from "react";
import {
	FieldError,
	FieldLabel,
	Field as FieldRoot,
} from "#/components/ui/field";

// The error is linked to the control only when the control is the only child.
export function Field({
	id,
	label,
	error,
	orientation = "vertical",
	children,
}: {
	id: string;
	label: string;
	error?: string;
	orientation?: "vertical" | "horizontal";
	children: ReactNode;
}) {
	const errorId = `${id}-error`;
	const control =
		error && isValidElement<Record<string, unknown>>(children)
			? cloneElement(children, {
					"aria-invalid": true,
					"aria-describedby": errorId,
				})
			: children;
	return (
		<FieldRoot
			orientation={orientation}
			className="gap-1.5"
			data-invalid={error ? true : undefined}
		>
			{orientation === "horizontal" && control}
			<FieldLabel
				htmlFor={id}
				className={
					orientation === "horizontal" ? "type-small font-normal" : undefined
				}
			>
				{label}
			</FieldLabel>
			{orientation === "vertical" && control}
			{error && <FieldError id={errorId}>{error}</FieldError>}
		</FieldRoot>
	);
}
