import { useMutation } from "@tanstack/react-query";
import { cn } from "cn";
import { useState } from "react";
import { StoreButton } from "#/components/store/ui/store-button";
import { Checkbox } from "#/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "#/components/ui/native-select";
import { api, parseResponse } from "#/lib/api";
import { errorMessage } from "#/lib/errors";
import { SV_LOCATIONS } from "#/lib/sv-locations";
import { m } from "#/paraglide/messages";

const input = "h-(--control-lg) md:type-body";

export function AddressForm({
	onDone,
	onCancel,
	className,
}: {
	onDone: () => void;
	onCancel: () => void;
	className?: string;
}) {
	const [recipientName, setRecipientName] = useState("");
	const [department, setDepartment] = useState("");
	const [municipality, setMunicipality] = useState("");
	const [addressLine, setAddressLine] = useState("");
	const [reference, setReference] = useState("");
	const [phone, setPhone] = useState("");
	const [isDefault, setIsDefault] = useState(false);
	const municipalities =
		SV_LOCATIONS.find((l) => l.department === department)?.municipalities ?? [];
	const save = useMutation({
		mutationFn: () =>
			parseResponse(
				api().account.addresses.$post({
					json: {
						recipientName,
						department,
						municipality,
						addressLine,
						reference: reference.trim() || null,
						phone,
						isDefault,
					},
				}),
			),
		onSuccess: onDone,
	});
	return (
		<form
			className={cn("grid max-w-xl gap-4 border p-6", className)}
			onSubmit={(e) => {
				e.preventDefault();
				save.mutate();
			}}
		>
			<Field className="gap-1.5">
				<FieldLabel htmlFor="address-recipient">
					{m.account_recipient()}
				</FieldLabel>
				<Input
					id="address-recipient"
					value={recipientName}
					onChange={(e) => setRecipientName(e.target.value)}
					required
					maxLength={80}
					autoComplete="name"
					className={input}
				/>
			</Field>
			<div className="grid gap-4 md:grid-cols-2">
				<Field className="gap-1.5">
					<FieldLabel htmlFor="address-department">
						{m.account_department()}
					</FieldLabel>
					<NativeSelect
						id="address-department"
						value={department}
						required
						onChange={(e) => {
							setDepartment(e.target.value);
							setMunicipality("");
						}}
						className={input}
					>
						<NativeSelectOption value="">
							{m.account_choose()}
						</NativeSelectOption>
						{SV_LOCATIONS.map((l) => (
							<NativeSelectOption key={l.department} value={l.department}>
								{l.department}
							</NativeSelectOption>
						))}
					</NativeSelect>
				</Field>
				<Field className="gap-1.5">
					<FieldLabel htmlFor="address-municipality">
						{m.account_municipality()}
					</FieldLabel>
					<NativeSelect
						id="address-municipality"
						value={municipality}
						required
						disabled={municipalities.length === 0}
						onChange={(e) => setMunicipality(e.target.value)}
						className={input}
					>
						<NativeSelectOption value="">
							{m.account_choose()}
						</NativeSelectOption>
						{municipalities.map((name) => (
							<NativeSelectOption key={name} value={name}>
								{name}
							</NativeSelectOption>
						))}
					</NativeSelect>
				</Field>
			</div>
			<Field className="gap-1.5">
				<FieldLabel htmlFor="address-line">
					{m.account_address_line()}
				</FieldLabel>
				<Input
					id="address-line"
					value={addressLine}
					onChange={(e) => setAddressLine(e.target.value)}
					required
					maxLength={200}
					autoComplete="street-address"
					className={input}
				/>
			</Field>
			<Field className="gap-1.5">
				<FieldLabel htmlFor="address-reference">
					{m.account_reference()}
				</FieldLabel>
				<Input
					id="address-reference"
					value={reference}
					onChange={(e) => setReference(e.target.value)}
					maxLength={200}
					className={input}
				/>
			</Field>
			<Field className="gap-1.5">
				<FieldLabel htmlFor="address-phone">{m.account_phone()}</FieldLabel>
				<Input
					id="address-phone"
					type="tel"
					value={phone}
					onChange={(e) => setPhone(e.target.value)}
					required
					maxLength={30}
					autoComplete="tel"
					placeholder="7123 4567"
					className={input}
				/>
			</Field>
			<Field orientation="horizontal" className="items-start gap-2.5">
				<Checkbox
					id="address-default"
					checked={isDefault}
					onCheckedChange={(checked) => setIsDefault(checked === true)}
					className="tap-area mt-0.5 rounded-sm"
				/>
				<FieldLabel htmlFor="address-default" className="font-normal">
					{m.account_make_default()}
				</FieldLabel>
			</Field>
			{save.isError && <FieldError>{errorMessage(save.error)}</FieldError>}
			<div className="flex flex-wrap gap-3">
				<StoreButton type="submit" pending={save.isPending}>
					{m.account_save()}
				</StoreButton>
				<StoreButton type="button" variant="outline" onClick={onCancel}>
					{m.account_cancel()}
				</StoreButton>
			</div>
		</form>
	);
}
