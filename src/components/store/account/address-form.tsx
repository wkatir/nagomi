import { useMutation } from "@tanstack/react-query";
import { cn } from "cn";
import { useState } from "react";
import {
	ConsentField,
	LocationFields,
	PhoneField,
	TextField,
} from "#/components/store/form-fields";
import { StoreButton } from "#/components/store/ui/store-button";
import { FieldError } from "#/components/ui/field";
import { api, parseResponse } from "#/lib/api";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";

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
	const [tried, setTried] = useState(false);
	const save = useMutation({
		mutationFn: () =>
			parseResponse(
				api().account.addresses.$post({
					json: {
						recipientName: recipientName.trim(),
						department,
						municipality,
						addressLine: addressLine.trim(),
						reference: reference.trim() || null,
						phone: `+503${phone.replace(/\D/g, "")}`,
						isDefault,
					},
				}),
			),
		onSuccess: onDone,
	});
	const errors = tried
		? {
				recipientName: recipientName.trim()
					? null
					: m.checkout_error_name_required(),
				department: department ? null : m.checkout_error_department_required(),
				municipality: municipality
					? null
					: m.checkout_error_municipality_required(),
				addressLine: addressLine.trim()
					? null
					: m.checkout_error_address_line_required(),
				phone: /^\d{8}$/.test(phone.replace(/\D/g, ""))
					? null
					: m.checkout_error_phone_invalid(),
			}
		: {};
	return (
		<form
			noValidate
			className={cn("panel grid gap-4 p-5", className)}
			onSubmit={(e) => {
				e.preventDefault();
				setTried(true);
				const ok =
					recipientName.trim() &&
					department &&
					municipality &&
					addressLine.trim() &&
					/^\d{8}$/.test(phone.replace(/\D/g, ""));
				if (ok) save.mutate();
			}}
		>
			<h3 className="type-h3">{m.account_add_address()}</h3>
			<div className="grid gap-4 sm:grid-cols-2">
				<TextField
					id="address-recipient"
					label={m.account_recipient()}
					value={recipientName}
					onChange={setRecipientName}
					maxLength={80}
					autoComplete="name"
					error={errors.recipientName}
				/>
				<PhoneField
					id="address-phone"
					label={m.checkout_phone()}
					value={phone}
					onChange={setPhone}
					error={errors.phone}
				/>
			</div>
			<LocationFields
				idPrefix="address"
				department={department}
				municipality={municipality}
				onDepartment={setDepartment}
				onMunicipality={setMunicipality}
				errors={{
					department: errors.department,
					municipality: errors.municipality,
				}}
			/>
			<TextField
				id="address-line"
				label={m.checkout_address_line()}
				hint={m.checkout_address_line_hint()}
				value={addressLine}
				onChange={setAddressLine}
				maxLength={200}
				autoComplete="street-address"
				error={errors.addressLine}
			/>
			<TextField
				id="address-reference"
				label={m.checkout_reference()}
				hint={m.checkout_reference_hint()}
				value={reference}
				onChange={setReference}
				maxLength={200}
			/>
			<ConsentField
				id="address-default"
				checked={isDefault}
				onChange={setIsDefault}
			>
				{m.account_make_default()}
			</ConsentField>
			{save.isError && <FieldError>{errorMessage(save.error)}</FieldError>}
			<div className="flex flex-wrap gap-3">
				<StoreButton type="submit" pending={save.isPending}>
					{m.account_save_address()}
				</StoreButton>
				<StoreButton type="button" variant="outline" onClick={onCancel}>
					{m.account_cancel()}
				</StoreButton>
			</div>
		</form>
	);
}
