import { cn } from "cn";
import type { ComponentProps } from "react";
import { Badge } from "#/components/ui/badge";
import type {
	CustomerSegment,
	OrderPaymentStatus,
	OrderStatus,
	ReviewStatus,
} from "#/lib/enums";
import { m } from "#/paraglide/messages";
import {
	customerSegmentLabel,
	orderStatusLabel,
	paymentStatusLabel,
} from "./labels";

export type Tone =
	| "neutral"
	| "accent"
	| "info"
	| "success"
	| "warning"
	| "danger";

const toneClass: Record<Tone, string> = {
	neutral: "border-border bg-muted text-muted-foreground",
	accent: "border-primary/40 bg-primary/15 text-primary",
	info: "border-chart-2/40 bg-chart-2/15 text-chart-2",
	success: "border-success/40 bg-success/15 text-success",
	warning: "border-warning/40 bg-warning/15 text-warning",
	danger: "border-destructive/40 bg-destructive/15 text-destructive",
};

export function ToneBadge({
	tone,
	className,
	...props
}: ComponentProps<typeof Badge> & { tone: Tone }) {
	return (
		<Badge
			variant="outline"
			data-tone={tone}
			className={cn(toneClass[tone], className)}
			{...props}
		/>
	);
}

export const orderStatusTone: Record<OrderStatus, Tone> = {
	pending: "warning",
	paid: "accent",
	shipped: "info",
	delivered: "success",
	cancelled: "neutral",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
	return (
		<ToneBadge tone={orderStatusTone[status]}>
			{orderStatusLabel[status]()}
		</ToneBadge>
	);
}

export const customerSegmentTone: Record<CustomerSegment, Tone> = {
	new: "info",
	occasional: "neutral",
	frequent: "success",
	inactive: "warning",
};

export function CustomerSegmentBadge({
	segment,
}: {
	segment: CustomerSegment | null;
}) {
	if (segment === null)
		return (
			<span className="text-muted-foreground">
				{m.admin_customer_segment_unknown()}
			</span>
		);
	return (
		<ToneBadge tone={customerSegmentTone[segment]}>
			{customerSegmentLabel[segment]()}
		</ToneBadge>
	);
}

export const paymentStatusTone: Record<OrderPaymentStatus, Tone> = {
	unpaid: "warning",
	partially_paid: "warning",
	paid: "success",
	refund_due: "danger",
	refunded: "neutral",
	nothing_due: "neutral",
};

export function PaymentStatusBadge({ status }: { status: OrderPaymentStatus }) {
	return (
		<ToneBadge tone={paymentStatusTone[status]}>
			{paymentStatusLabel[status]()}
		</ToneBadge>
	);
}

export const reviewStatusTone: Record<ReviewStatus, Tone> = {
	pending: "warning",
	approved: "success",
	rejected: "neutral",
};
