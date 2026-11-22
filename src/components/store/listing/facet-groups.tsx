import { useId } from "react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion";
import { Checkbox } from "#/components/ui/checkbox";
import { Field, FieldLabel } from "#/components/ui/field";
import {
	type Facet,
	type ListingScope,
	type ListingSearch,
	listOf,
	setAvailability,
	toggle,
} from "#/lib/listing";
import type { ProductPage } from "#/lib/queries";
import { m } from "#/paraglide/messages";

type Facets = ProductPage["facets"];

const GROUPS: { facet: Facet; title: () => string }[] = [
	{ facet: "category", title: m.shop_type_label },
	{ facet: "brand", title: m.shop_facet_brand },
];

// The checks follow `search`, which the list updates at once, not the data, which arrives
// after the new list loads.
export function FacetGroups({
	facets,
	search,
	scope,
	onChange,
}: {
	facets: Facets;
	search: ListingSearch;
	scope: ListingScope;
	onChange: (next: ListingSearch) => void;
}) {
	const prefix = useId();
	const groups = GROUPS.filter(
		({ facet }) =>
			scope[facet] === undefined &&
			(facets[facet].length > 1 ||
				facets[facet].some((v) => listOf(search[facet]).includes(v.slug))),
	);
	const inStock = facets.availability.find((v) => v.value === "in_stock");
	return (
		<Accordion
			type="multiple"
			defaultValue={[...groups.map((g) => g.facet), "availability"]}
			className="border-t"
		>
			{groups.map(({ facet, title }) => (
				<AccordionItem key={facet} value={facet}>
					<AccordionTrigger className="py-4 type-ui font-bold hover:no-underline">
						{title()}
					</AccordionTrigger>
					<AccordionContent className="pb-3">
						<ul>
							{facets[facet].map((value) => {
								const checked = listOf(search[facet]).includes(value.slug);
								const id = `${prefix}-${facet}-${value.slug}`;
								return (
									<li key={value.slug}>
										<Option
											id={id}
											checked={checked}
											disabled={value.count === 0 && !checked}
											label={value.name}
											count={value.count}
											onChange={() =>
												onChange(toggle(search, facet, value.slug))
											}
										/>
									</li>
								);
							})}
						</ul>
					</AccordionContent>
				</AccordionItem>
			))}
			{inStock && (
				<AccordionItem value="availability">
					<AccordionTrigger className="py-4 type-ui font-bold hover:no-underline">
						{m.shop_facet_stock()}
					</AccordionTrigger>
					<AccordionContent className="pb-3">
						<Option
							id={`${prefix}-availability`}
							checked={search.availability === "in_stock"}
							disabled={
								inStock.count === 0 && search.availability !== "in_stock"
							}
							label={m.shop_filter_in_stock()}
							count={inStock.count}
							onChange={(on) => onChange(setAvailability(search, on))}
						/>
					</AccordionContent>
				</AccordionItem>
			)}
		</Accordion>
	);
}

function Option({
	id,
	checked,
	disabled,
	label,
	count,
	onChange,
}: {
	id: string;
	checked: boolean;
	disabled: boolean;
	label: string;
	count: number;
	onChange: (checked: boolean) => void;
}) {
	return (
		<Field orientation="horizontal" className="min-h-11 items-center gap-2.5">
			<Checkbox
				id={id}
				checked={checked}
				disabled={disabled}
				onCheckedChange={(next) => onChange(next === true)}
				className="tap-area rounded-sm"
			/>
			<FieldLabel
				htmlFor={id}
				className="flex-1 justify-between gap-3 type-ui font-normal"
			>
				<span>{label}</span>
				<span className="text-muted-foreground tabular-nums">{count}</span>
			</FieldLabel>
		</Field>
	);
}
