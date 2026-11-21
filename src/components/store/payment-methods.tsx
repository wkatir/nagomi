import { cn } from "cn";
import { type paymentLabel, paymentMethodList } from "#/lib/payment";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

export function PaymentMethods({
	methods,
	className,
}: {
	methods: readonly (keyof typeof paymentLabel)[];
	className?: string;
}) {
	if (methods.length === 0) return null;
	return (
		<p className={cn("type-small text-muted-foreground", className)}>
			{m.cart_payment_methods({
				methods: paymentMethodList(methods, getLocale()),
			})}
		</p>
	);
}
