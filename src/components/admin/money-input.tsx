import type * as React from "react";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "#/components/ui/input-group";
import { useCurrencySymbol, useMoneyInput } from "#/hooks/use-money";

export function MoneyInput(
	props: Omit<
		React.ComponentProps<typeof InputGroupInput>,
		"type" | "inputMode"
	>,
) {
	const symbol = useCurrencySymbol();
	const { toInput } = useMoneyInput();
	return (
		<InputGroup>
			<InputGroupAddon>
				<InputGroupText>{symbol}</InputGroupText>
			</InputGroupAddon>
			<InputGroupInput
				inputMode="decimal"
				placeholder={toInput(0)}
				{...props}
			/>
		</InputGroup>
	);
}
