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
	rating: m.shop_sort_rating,
	price_asc: m.shop_sort_price_asc,
	price_desc: m.shop_sort_price_desc,
	newest: m.shop_sort_newest,
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
		<Field
			orientation="horizontal"
			className="w-auto min-w-0 shrink-0 items-center gap-2 [&_[data-slot=native-select-wrapper]]:w-full md:[&_[data-slot=native-select-wrapper]]:w-48"
		>
			<FieldLabel
				htmlFor={id}
				className="shrink-0 type-small font-normal text-muted-foreground"
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
				className="h-10 truncate rounded-full bg-card pl-4 type-small"
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
