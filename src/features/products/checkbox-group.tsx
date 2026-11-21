import { useId } from "react";
import { Field } from "#/components/admin/field";
import { Checkbox } from "#/components/ui/checkbox";
import { FieldLegend, FieldSet } from "#/components/ui/field";

export const toggled = <T extends string>(
	all: readonly T[],
	chosen: readonly T[],
	value: T,
	checked: boolean,
): T[] => all.filter((v) => (v === value ? checked : chosen.includes(v)));

export function CheckboxGroup<T extends string>({
	legend,
	options,
	value,
	onChange,
}: {
	legend: string;
	options: readonly { value: T; label: string }[];
	value: readonly T[];
	onChange: (value: T[]) => void;
}) {
	const id = useId();
	return (
		<FieldSet className="gap-0">
			<FieldLegend variant="label">{legend}</FieldLegend>
			<div className="grid gap-2">
				{options.map((option) => (
					<Field
						key={option.value}
						id={`${id}-${option.value}`}
						label={option.label}
						orientation="horizontal"
					>
						<Checkbox
							id={`${id}-${option.value}`}
							checked={value.includes(option.value)}
							onCheckedChange={(checked) =>
								onChange(
									toggled(
										options.map((o) => o.value),
										value,
										option.value,
										checked === true,
									),
								)
							}
							className="rounded-sm"
						/>
					</Field>
				))}
			</div>
		</FieldSet>
	);
}
