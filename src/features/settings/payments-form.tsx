import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { useState } from "react";
import { FormCard } from "#/components/admin/form-card";
import { MoneyInput } from "#/components/admin/money-input";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { FieldError } from "#/components/ui/field";
import { Label } from "#/components/ui/label";
import {
	NativeSelect,
	NativeSelectOption,
} from "#/components/ui/native-select";
import { useMoneyInput } from "#/hooks/use-money";
import type { AdminSettings } from "#/lib/api";
import { PAYMENT_METHODS, type PaymentMethod } from "#/lib/enums";
import { errorMessage } from "#/lib/errors";
import { paymentLabel } from "#/lib/payment";
import { m } from "#/paraglide/messages";
import { activeZonesQuery } from "../shipping/queries";
import { useSaveSettings } from "./mutations";

export type PaymentRow = {
	method: PaymentMethod;
	enabled: boolean;
	maxTotal: string;
	shippingZoneId: string;
};

export function paymentRows(
	options: AdminSettings["paymentOptions"],
	toInput: (amount: number) => string,
): PaymentRow[] {
	const enabled = options.map(
		(option): PaymentRow => ({
			method: option.method,
			enabled: true,
			maxTotal: option.maxTotal === null ? "" : toInput(option.maxTotal),
			shippingZoneId:
				option.shippingZoneId === null ? "" : String(option.shippingZoneId),
		}),
	);
	const rest = PAYMENT_METHODS.filter(
		(method) => !options.some((option) => option.method === method),
	).map(
		(method): PaymentRow => ({
			method,
			enabled: false,
			maxTotal: "",
			shippingZoneId: "",
		}),
	);
	return [...enabled, ...rest];
}

export function paymentOptionsPayload(
	rows: PaymentRow[],
	parse: (text: string) => number | null,
) {
	const invalid: PaymentMethod[] = [];
	const options = rows
		.filter((row) => row.enabled)
		.map((row) => {
			const maxTotal = row.maxTotal.trim() === "" ? null : parse(row.maxTotal);
			if (row.maxTotal.trim() !== "" && (maxTotal === null || maxTotal < 1))
				invalid.push(row.method);
			return {
				method: row.method,
				maxTotal,
				shippingZoneId:
					row.shippingZoneId === "" ? null : Number(row.shippingZoneId),
			};
		});
	return { options, invalid };
}

function PaymentsForm({ settings }: { settings: AdminSettings }) {
	const save = useSaveSettings();
	const moneyInput = useMoneyInput();
	const { data: zones } = useSuspenseQuery(activeZonesQuery);
	const started = paymentRows(settings.paymentOptions, moneyInput.toInput);
	const [rows, setRows] = useState(started);
	const [error, setError] = useState<string | null>(null);
	const { options, invalid } = paymentOptionsPayload(rows, moneyInput.parse);
	const unchanged = JSON.stringify(rows) === JSON.stringify(started);

	const submit = useMutation({
		mutationFn: () => save.mutateAsync({ paymentOptions: options }),
		onError: (e) => setError(errorMessage(e)),
	});

	const change = (index: number, patch: Partial<PaymentRow>) =>
		setRows((current) =>
			current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
		);
	const move = (from: number, to: number) =>
		setRows((current) => {
			if (to < 0 || to >= current.length) return current;
			const next = [...current];
			const [row] = next.splice(from, 1);
			next.splice(to, 0, row as PaymentRow);
			return next;
		});
	const zoneName = (zone: (typeof zones)[number]) =>
		zone.translations.find((t) => t.locale === settings.defaultLocale)?.name ??
		zone.slug;

	return (
		<FormCard
			title={m.admin_field_payment_methods()}
			description={m.admin_settings_payments_help()}
			onSubmit={(event) => {
				event.preventDefault();
				setError(null);
				if (invalid.length === 0) submit.mutate();
			}}
			footer={
				<Button type="submit" disabled={unchanged || submit.isPending}>
					{m.admin_save()}
				</Button>
			}
		>
			<ol className="grid gap-3">
				{rows.map((row, index) => {
					const id = `payment-${row.method}`;
					return (
						<li
							key={row.method}
							className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_10rem_12rem_auto] sm:items-end"
						>
							<div className="flex items-center gap-2 self-center">
								<Checkbox
									id={id}
									checked={row.enabled}
									onCheckedChange={(checked) =>
										change(index, { enabled: checked === true })
									}
									className="rounded-sm"
								/>
								<Label htmlFor={id} className="type-small font-normal">
									{paymentLabel[row.method]()}
								</Label>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor={`${id}-max`} className="type-meta">
									{m.admin_settings_payment_max_total()}
								</Label>
								<MoneyInput
									id={`${id}-max`}
									value={row.maxTotal}
									disabled={!row.enabled}
									aria-invalid={invalid.includes(row.method) ? true : undefined}
									onChange={(event) =>
										change(index, { maxTotal: event.target.value })
									}
								/>
								{invalid.includes(row.method) && (
									<FieldError>{m.admin_invalid_amount()}</FieldError>
								)}
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor={`${id}-zone`} className="type-meta">
									{m.admin_settings_payment_zone()}
								</Label>
								<NativeSelect
									id={`${id}-zone`}
									value={row.shippingZoneId}
									disabled={!row.enabled}
									onChange={(event) =>
										change(index, { shippingZoneId: event.target.value })
									}
								>
									<NativeSelectOption value="">
										{m.admin_settings_payment_any_zone()}
									</NativeSelectOption>
									{zones.map((zone) => (
										<NativeSelectOption key={zone.id} value={String(zone.id)}>
											{zoneName(zone)}
										</NativeSelectOption>
									))}
								</NativeSelect>
							</div>
							<div className="flex justify-end">
								<Button
									type="button"
									size="icon"
									variant="ghost"
									aria-label={m.admin_settings_payment_up({
										method: paymentLabel[row.method](),
									})}
									disabled={index === 0}
									onClick={() => move(index, index - 1)}
								>
									<ArrowUpIcon aria-hidden />
								</Button>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									aria-label={m.admin_settings_payment_down({
										method: paymentLabel[row.method](),
									})}
									disabled={index === rows.length - 1}
									onClick={() => move(index, index + 1)}
								>
									<ArrowDownIcon aria-hidden />
								</Button>
							</div>
						</li>
					);
				})}
			</ol>
			{error && <FieldError>{error}</FieldError>}
		</FormCard>
	);
}

export function PaymentsCard({ settings }: { settings: AdminSettings }) {
	return (
		<PaymentsForm
			key={JSON.stringify(settings.paymentOptions)}
			settings={settings}
		/>
	);
}
