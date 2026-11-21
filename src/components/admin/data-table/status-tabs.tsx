import { PageTab, PageTabs } from "#/components/admin/page-tabs";

export function StatusTabs<T extends string>({
	values,
	label,
	allLabel,
	value,
	onChange,
}: {
	values: readonly T[];
	label: Record<T, () => string>;
	allLabel: string;
	value: T | undefined;
	onChange: (value: T | undefined) => void;
}) {
	return (
		<PageTabs
			value={value ?? "all"}
			onValueChange={(next) => onChange(values.find((v) => v === next))}
		>
			{[undefined, ...values].map((status) => (
				<PageTab key={status ?? "all"} value={status ?? "all"}>
					{status ? label[status]() : allLabel}
				</PageTab>
			))}
		</PageTabs>
	);
}
