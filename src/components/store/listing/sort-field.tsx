import { useId } from "react";
import { Field, FieldLabel } from "#/components/ui/field";
import {
	NativeSelect,
	NativeSelectOption,
} from "#/components/ui/native-select";
import { SORTS } from "#/lib/listing";
import { m } from "#/paraglide/messages";

type Sort = (typeof SORTS)[number];

const sortLabel: Record<Sort, () => string> = {
	featured: m.shop_sort_featured,
	newest: m.shop_sort_newest,
	price_asc: m.shop_sort_price_asc,
	price_desc: m.shop_sort_price_desc,
	name: m.shop_sort_name,
};

export function SortField({
	value,
	onChange,
}: {
	value: Sort;
	onChange: (sort: Sort) => void;
}) {
	const id = useId();
	return (
		<Field className="w-auto min-w-0 shrink-0 gap-1.5 md:[&_[data-slot=native-select-wrapper]]:w-52 [&_[data-slot=native-select-wrapper]]:w-full">
			<FieldLabel
				htmlFor={id}
				className="type-small font-normal text-muted-foreground"
			>
				{m.shop_sort_label()}
			</FieldLabel>
			<NativeSelect
				id={id}
				value={value}
				onChange={(event) => {
					const sort = SORTS.find((s) => s === event.target.value);
					if (sort) onChange(sort);
				}}
				className="h-(--control-lg) truncate bg-background type-body"
			>
				{SORTS.map((sort) => (
					<NativeSelectOption key={sort} value={sort}>
						{sortLabel[sort]()}
					</NativeSelectOption>
				))}
			</NativeSelect>
		</Field>
	);
}
