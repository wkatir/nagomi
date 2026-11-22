import { useId, useState } from "react";
import { StoreButton } from "#/components/store/ui/store-button";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion";
import { Checkbox } from "#/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "#/components/ui/input-group";
import { useCurrencySymbol, useMoneyInput } from "#/hooks/use-money";
import {
	type Facet,
	type ListingScope,
	type ListingSearch,
	listOf,
	setAvailability,
	setPrice,
	toggle,
} from "#/lib/listing";
import type { ProductPage } from "#/lib/queries";
import { m } from "#/paraglide/messages";

type Facets = ProductPage["facets"];

const GROUPS: { facet: Facet; title: () => string }[] = [
	{ facet: "category", title: m.shop_type_label },
	{ facet: "brand", title: m.shop_facet_brand },
];

export function FacetGroups({
	facets,
	priceRange,
	search,
	scope,
	onChange,
}: {
	facets: Facets;
	priceRange?: ProductPage["priceRange"];
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
			defaultValue={[...groups.map((g) => g.facet), "price", "availability"]}
			className="panel px-4"
		>
			{groups.map(({ facet, title }) => (
				<AccordionItem key={facet} value={facet}>
					<AccordionTrigger className="py-3.5 type-small font-semibold hover:no-underline">
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
			{priceRange && (
				<AccordionItem value="price">
					<AccordionTrigger className="py-3.5 type-small font-semibold hover:no-underline">
						{m.shop_facet_price()}
					</AccordionTrigger>
					<AccordionContent className="pb-4">
						<PriceRange
							key={`${search.minPrice}-${search.maxPrice}`}
							range={priceRange}
							search={search}
							onChange={onChange}
						/>
					</AccordionContent>
				</AccordionItem>
			)}
			{inStock && (
				<AccordionItem value="availability" className="border-b-0">
					<AccordionTrigger className="py-3.5 type-small font-semibold hover:no-underline">
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
		<Field orientation="horizontal" className="min-h-10 items-center gap-2.5">
			<Checkbox
				id={id}
				checked={checked}
				disabled={disabled}
				onCheckedChange={(next) => onChange(next === true)}
				className="tap-area rounded-sm"
			/>
			<FieldLabel
				htmlFor={id}
				className="flex-1 justify-between gap-3 type-small font-normal text-foreground-secondary"
			>
				<span>{label}</span>
				<span className="text-muted-foreground tabular-nums">{count}</span>
			</FieldLabel>
		</Field>
	);
}

function PriceRange({
	range,
	search,
	onChange,
}: {
	range: { min: number; max: number };
	search: ListingSearch;
	onChange: (next: ListingSearch) => void;
}) {
	const id = useId();
	const symbol = useCurrencySymbol();
	const { parse, toInput } = useMoneyInput();
	const [min, setMin] = useState(
		search.minPrice === undefined ? "" : toInput(search.minPrice),
	);
	const [max, setMax] = useState(
		search.maxPrice === undefined ? "" : toInput(search.maxPrice),
	);
	const [invalid, setInvalid] = useState(false);
	const bound = (text: string) => (text.trim() ? parse(text) : undefined);
	return (
		<form
			noValidate
			className="grid gap-3"
			onSubmit={(e) => {
				e.preventDefault();
				const low = bound(min);
				const high = bound(max);
				if (low === null || high === null) {
					setInvalid(true);
					return;
				}
				setInvalid(false);
				onChange(setPrice(search, low, high));
			}}
		>
			<div className="grid grid-cols-2 gap-2">
				{(
					[
						["min", m.shop_price_min(), min, setMin, range.min],
						["max", m.shop_price_max(), max, setMax, range.max],
					] as const
				).map(([key, label, value, set, placeholder]) => (
					<Field key={key} className="gap-1">
						<FieldLabel htmlFor={`${id}-${key}`} className="type-meta">
							{label}
						</FieldLabel>
						<InputGroup className="h-10 rounded-lg bg-background">
							<InputGroupAddon>
								<InputGroupText>{symbol}</InputGroupText>
							</InputGroupAddon>
							<InputGroupInput
								id={`${id}-${key}`}
								inputMode="decimal"
								value={value}
								placeholder={toInput(placeholder)}
								aria-invalid={invalid || undefined}
								onChange={(e) => set(e.target.value)}
								className="type-small tabular-nums"
							/>
						</InputGroup>
					</Field>
				))}
			</div>
			{invalid && <FieldError>{m.shop_price_invalid()}</FieldError>}
			<StoreButton type="submit" variant="outline" size="sm" fullWidth>
				{m.shop_price_apply()}
			</StoreButton>
		</form>
	);
}
