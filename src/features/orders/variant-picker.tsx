import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "#/components/ui/command";
import { useDebouncedValue } from "#/hooks/use-debounced-value";
import { useMoney } from "#/hooks/use-money";
import { m } from "#/paraglide/messages";
import { sellableVariantsQuery } from "./queries";

export type PickedVariant = {
	variantId: number;
	label: string;
	price: number;
	available: number;
};

const MIN_CHARS = 2;
const MAX_RESULTS = 20;

export function VariantPicker({
	picked,
	onPick,
}: {
	picked: ReadonlySet<number>;
	onPick: (variant: PickedVariant) => void;
}) {
	const money = useMoney();
	const [text, setText] = useState("");
	const q = useDebouncedValue(text.trim(), 250);
	const search = useQuery({
		...sellableVariantsQuery(q),
		enabled: q.length >= MIN_CHARS,
		placeholderData: keepPreviousData,
	});
	const rows = (search.data ?? [])
		.filter(
			(row): row is typeof row & { price: number } =>
				row.variantStatus === "active" && row.price !== null,
		)
		.slice(0, MAX_RESULTS);
	return (
		<Command shouldFilter={false} className="rounded-md border">
			<CommandInput
				value={text}
				onValueChange={setText}
				placeholder={m.admin_order_find_product()}
			/>
			{q.length >= MIN_CHARS && (
				<CommandList>
					<CommandEmpty>
						{search.isPending ? m.loading() : m.admin_search_empty()}
					</CommandEmpty>
					<CommandGroup>
						{rows.map((row) => {
							const size = row.optionLabel;
							const label = [row.brand, row.name, size]
								.filter(Boolean)
								.join(" ");
							const inSale = picked.has(row.variantId);
							return (
								<CommandItem
									key={row.variantId}
									value={String(row.variantId)}
									disabled={inSale || row.available < 1}
									onSelect={() => {
										onPick({
											variantId: row.variantId,
											label,
											price: row.price,
											available: row.available,
										});
										setText("");
									}}
								>
									<span className="flex-1">{label}</span>
									<span className="type-meta text-muted-foreground">
										{row.sku}
									</span>
									{inSale ? (
										<Badge variant="secondary">{m.admin_order_in_sale()}</Badge>
									) : (
										<span className="type-meta text-muted-foreground">
											{m.admin_stock_n({ count: row.available })}
										</span>
									)}
									<span className="tabular-nums">{money(row.price)}</span>
								</CommandItem>
							);
						})}
					</CommandGroup>
				</CommandList>
			)}
		</Command>
	);
}
