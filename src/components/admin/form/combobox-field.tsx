import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useId, useState } from "react";
import { Field } from "#/components/admin/field";
import { Button } from "#/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "#/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import { m } from "#/paraglide/messages";
import { useFieldContext } from "./form-context";

export type ComboboxOption = { value: string; label: string; hint?: string };

export function ComboboxField({
	label,
	options,
	clearLabel,
}: {
	label: string;
	options: readonly ComboboxOption[];
	clearLabel?: string;
}) {
	const field = useFieldContext<string>();
	const id = useId();
	const [open, setOpen] = useState(false);
	const chosen = options.find((option) => option.value === field.state.value);
	const meta = field.state.meta;
	const [first] = meta.errors;
	const error =
		meta.isTouched && first !== undefined
			? typeof first === "string"
				? first
				: (first as { message: string }).message
			: undefined;
	const pick = (value: string) => {
		field.handleChange(value);
		setOpen(false);
	};
	return (
		<Field id={id} label={label} error={error}>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						id={id}
						type="button"
						variant="outline"
						role="combobox"
						aria-expanded={open}
						className="justify-between font-normal"
						onBlur={field.handleBlur}
					>
						<span className="truncate">
							{chosen?.label ?? m.admin_combobox_placeholder()}
						</span>
						<ChevronsUpDownIcon aria-hidden className="opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-(--radix-popover-trigger-width) p-0"
				>
					<Command>
						<CommandInput placeholder={m.admin_combobox_search()} />
						<CommandList>
							<CommandEmpty>{m.admin_search_empty()}</CommandEmpty>
							<CommandGroup>
								{clearLabel && (
									<CommandItem value="" onSelect={() => pick("")}>
										{clearLabel}
									</CommandItem>
								)}
								{options.map((option) => (
									<CommandItem
										key={option.value}
										value={`${option.label} ${option.hint ?? ""}`}
										onSelect={() => pick(option.value)}
									>
										<span className="flex-1 truncate">{option.label}</span>
										{option.hint && (
											<span className="type-meta text-muted-foreground">
												{option.hint}
											</span>
										)}
										{option.value === field.state.value && (
											<CheckIcon aria-hidden />
										)}
									</CommandItem>
								))}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</Field>
	);
}
