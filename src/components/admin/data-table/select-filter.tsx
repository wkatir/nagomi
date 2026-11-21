import {
	NativeSelect,
	NativeSelectOption,
} from "#/components/ui/native-select";

export function SelectFilter<T extends string>({
	label,
	allLabel,
	value,
	options,
	onChange,
}: {
	label: string;
	allLabel: string;
	value: T | undefined;
	options: readonly { value: T; label: string }[];
	onChange: (value: T | undefined) => void;
}) {
	return (
		<NativeSelect
			size="sm"
			aria-label={label}
			value={value ?? ""}
			onChange={(event) =>
				onChange(options.find((o) => o.value === event.target.value)?.value)
			}
		>
			<NativeSelectOption value="">{allLabel}</NativeSelectOption>
			{options.map((option) => (
				<NativeSelectOption key={option.value} value={option.value}>
					{option.label}
				</NativeSelectOption>
			))}
		</NativeSelect>
	);
}
