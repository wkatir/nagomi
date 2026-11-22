import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { languageName } from "#/components/admin/labels";
import { Section } from "#/components/admin/section";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { type AdminProduct, api, parseResponse } from "#/lib/api";
import { LOCALES, type Locale } from "#/lib/enums";
import { errorMessage } from "#/lib/errors";
import { storeQuery } from "#/lib/queries";
import { PRODUCT_LIMITS } from "#/lib/schemas/products";
import { m } from "#/paraglide/messages";
import { useRefreshAfterProductChange } from "./mutations";
import {
	emptySpecRow,
	moveRow,
	type SpecRow,
	specIssues,
	specRows,
	specsPayload,
} from "./specs-form";

export const specsValues = (product: AdminProduct) => specRows(product.specs);

export function SpecsCard({ product }: { product: AdminProduct }) {
	const refresh = useRefreshAfterProductChange();
	const { data: store } = useSuspenseQuery(storeQuery);
	const [rows, setRows] = useState<SpecRow[]>(() => specsValues(product));
	const [submitted, setSubmitted] = useState(false);
	const issues = specIssues(rows, store.defaultLocale);
	const unchanged =
		JSON.stringify(rows) === JSON.stringify(specsValues(product));
	const locales = [
		store.defaultLocale,
		...LOCALES.filter((l) => l !== store.defaultLocale),
	];

	const save = useMutation({
		mutationFn: () =>
			parseResponse(
				api().admin.products[":id"].specs.$put({
					param: { id: String(product.id) },
					json: { specs: specsPayload(rows) },
				}),
			),
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
		},
		onError: (error) => toast.error(errorMessage(error)),
	});

	const update =
		(index: number, locale: Locale, key: "label" | "value") => (text: string) =>
			setRows((current) =>
				current.map((row, i) =>
					i === index
						? { ...row, [locale]: { ...row[locale], [key]: text } }
						: row,
				),
			);

	return (
		<Section
			title={m.admin_product_specs()}
			description={m.admin_product_specs_hint()}
			action={
				<Button
					size="sm"
					variant="outline"
					disabled={rows.length >= PRODUCT_LIMITS.specs}
					onClick={() => setRows((current) => [...current, emptySpecRow()])}
				>
					{m.admin_product_spec_add()}
				</Button>
			}
		>
			{rows.length === 0 ? (
				<p className="type-small p-admin-card text-muted-foreground">
					{m.admin_product_specs_empty()}
				</p>
			) : (
				<ol>
					{rows.map((row, index) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: a row has no id until it is saved
							key={index}
							className="grid gap-2 border-b p-admin-card last:border-b-0"
						>
							{locales.map((locale) => {
								const issue = submitted
									? issues.find((i) => i.row === index && i.locale === locale)
									: undefined;
								return (
									<div
										key={locale}
										className="grid gap-2 sm:grid-cols-[5rem_1fr_2fr] sm:items-center"
									>
										<span className="type-meta text-muted-foreground">
											{languageName[locale]()}
										</span>
										<Input
											aria-label={m.admin_product_spec_label()}
											placeholder={m.admin_product_spec_label()}
											value={row[locale].label}
											maxLength={PRODUCT_LIMITS.specLabel}
											aria-invalid={issue ? true : undefined}
											onChange={(event) =>
												update(index, locale, "label")(event.target.value)
											}
										/>
										<Input
											aria-label={m.admin_product_spec_value()}
											placeholder={m.admin_product_spec_value()}
											value={row[locale].value}
											maxLength={PRODUCT_LIMITS.specValue}
											aria-invalid={issue ? true : undefined}
											onChange={(event) =>
												update(index, locale, "value")(event.target.value)
											}
										/>
										{issue && (
											<p className="type-meta text-destructive sm:col-span-2 sm:col-start-2">
												{issue.reason === "required"
													? m.admin_product_spec_required()
													: m.admin_product_spec_too_long()}
											</p>
										)}
									</div>
								);
							})}
							<div className="flex justify-end gap-1">
								<Button
									size="icon"
									variant="ghost"
									aria-label={m.admin_product_spec_up({ n: index + 1 })}
									disabled={index === 0}
									onClick={() => setRows((r) => moveRow(r, index, index - 1))}
								>
									<ArrowUpIcon aria-hidden />
								</Button>
								<Button
									size="icon"
									variant="ghost"
									aria-label={m.admin_product_spec_down({ n: index + 1 })}
									disabled={index === rows.length - 1}
									onClick={() => setRows((r) => moveRow(r, index, index + 1))}
								>
									<ArrowDownIcon aria-hidden />
								</Button>
								<Button
									size="icon"
									variant="ghost"
									aria-label={m.admin_product_spec_remove({ n: index + 1 })}
									onClick={() =>
										setRows((r) => r.filter((_, i) => i !== index))
									}
								>
									<TrashIcon aria-hidden />
								</Button>
							</div>
						</li>
					))}
				</ol>
			)}
			<div className="flex justify-end border-t p-admin-card">
				<Button
					disabled={unchanged || save.isPending}
					onClick={() => {
						setSubmitted(true);
						if (issues.length === 0) save.mutate();
					}}
				>
					{m.admin_save()}
				</Button>
			</div>
		</Section>
	);
}
