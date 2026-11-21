import { useSuspenseQuery } from "@tanstack/react-query";
import { enUS, es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "#/components/ui/button";
import { Calendar } from "#/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";

import { useCalendarDate } from "#/hooks/use-store-date";
import { addDays, fromPickerDate, pickerDate, storeToday } from "#/lib/dates";

import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

const pickerLocale = { es, en: enUS } as const;

type Days = { from: string | undefined; to: string | undefined };

export function DateRangeFilter({
	value,
	onChange,
}: {
	value: Days;
	onChange: (days: Days) => void;
}) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<DateRange | undefined>();
	const { data: store } = useSuspenseQuery(storeQuery);
	const locale = getLocale();
	const format = useCalendarDate();
	const label =
		value.from && value.to
			? `${format(value.from)} - ${format(value.to)}`
			: m.admin_filter_dates();

	const today = storeToday(store.timeZone);
	const shortcuts: { label: string; days: Days }[] = [
		{ label: m.admin_range_today(), days: { from: today, to: today } },
		{
			label: m.admin_range_last_7(),
			days: { from: addDays(today, -6), to: today },
		},
		{
			label: m.admin_range_last_30(),
			days: { from: addDays(today, -29), to: today },
		},
		{
			label: m.admin_range_this_month(),
			days: { from: `${today.slice(0, 8)}01`, to: today },
		},
	];
	const apply = (days: Days) => {
		setDraft(undefined);
		setOpen(false);
		onChange(days);
	};
	const selected: DateRange | undefined =
		draft ??
		(value.from && value.to
			? { from: pickerDate(value.from), to: pickerDate(value.to) }
			: undefined);

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				// A half-picked range is dropped, not applied.
				if (!next) setDraft(undefined);
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					data-active={Boolean(value.from && value.to)}
					className="font-normal data-[active=false]:text-muted-foreground"
				>
					<CalendarIcon aria-hidden />
					{label}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-auto p-0">
				<div className="flex flex-col md:flex-row">
					<div className="flex flex-wrap gap-1 border-b p-2 md:w-40 md:flex-col md:border-r md:border-b-0">
						{shortcuts.map((shortcut) => (
							<Button
								key={shortcut.label}
								variant="ghost"
								size="sm"
								className="justify-start font-normal"
								onClick={() => apply(shortcut.days)}
							>
								{shortcut.label}
							</Button>
						))}
						{value.from && value.to && (
							<Button
								variant="ghost"
								size="sm"
								className="justify-start font-normal text-muted-foreground"
								onClick={() => apply({ from: undefined, to: undefined })}
							>
								{m.admin_range_clear()}
							</Button>
						)}
					</div>
					<Calendar
						mode="range"
						locale={pickerLocale[locale]}
						selected={selected}
						defaultMonth={selected?.from ?? pickerDate(today)}
						numberOfMonths={2}
						onSelect={(range) => {
							if (range?.from && range.to)
								return apply({
									from: fromPickerDate(range.from),
									to: fromPickerDate(range.to),
								});
							setDraft(range);
						}}
					/>
				</div>
			</PopoverContent>
		</Popover>
	);
}
