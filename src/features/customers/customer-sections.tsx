import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
	consentChannelLabel,
	consentPurposeLabel,
	reviewStatusLabel,
} from "#/components/admin/labels";
import { Fact, Section } from "#/components/admin/section";
import {
	CustomerSegmentBadge,
	OrderStatusBadge,
	reviewStatusTone,
	ToneBadge,
} from "#/components/admin/tone-badge";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion";
import { Badge } from "#/components/ui/badge";
import { useMoney } from "#/hooks/use-money";
import { useStoreDate } from "#/hooks/use-store-date";
import { m } from "#/paraglide/messages";
import type { AdminCustomer } from "./queries";

export function CustomerSummary({ detail }: { detail: AdminCustomer }) {
	const money = useMoney();
	const formatDate = useStoreDate();
	const { totals } = detail;
	const figures = [
		[m.admin_customer_col_orders(), String(totals.orders)],
		[m.admin_customer_col_spent(), money(totals.lifetimeValue)],
		[m.admin_customer_net_paid(), money(totals.netPaid)],
		[m.admin_customer_balance(), money(totals.balance)],
	] as const;
	const day = (instant: string | null) =>
		instant ? formatDate(instant, { dateStyle: "medium" }) : null;
	return (
		<Section title={m.admin_customer_summary()}>
			<dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-admin-card sm:grid-cols-4">
				{figures.map(([label, value]) => (
					<div key={label}>
						<dt className="type-meta text-muted-foreground">{label}</dt>
						<dd className="type-ui font-bold tabular-nums">{value}</dd>
					</div>
				))}
			</dl>
			{totals.firstOrderAt && (
				<dl className="grid grid-cols-2 gap-4 border-t p-admin-card">
					<Fact
						label={m.admin_customer_first_order()}
						value={day(totals.firstOrderAt)}
					/>
					<Fact
						label={m.admin_customer_col_last_order()}
						value={day(totals.lastOrderAt)}
					/>
				</dl>
			)}
		</Section>
	);
}

export function CustomerOrders({ detail }: { detail: AdminCustomer }) {
	const money = useMoney();
	const formatDate = useStoreDate();
	const { orders } = detail;
	return (
		<Section title={m.admin_customer_col_orders()}>
			{orders.length === 0 ? (
				<p className="type-small p-admin-card text-muted-foreground">
					{m.admin_customer_orders_empty()}
				</p>
			) : (
				<ul>
					{orders.map((order) => (
						<li key={order.id} className="border-b last:border-b-0">
							<Link
								to="/admin/orders/$id"
								params={{ id: order.id }}
								className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 p-admin-card hover:bg-muted/50"
							>
								<span className="type-small font-bold">{order.code}</span>
								<span className="type-small text-right font-bold tabular-nums">
									{money(order.total)}
								</span>
								<span className="type-meta text-muted-foreground">
									{formatDate(order.createdAt, { dateStyle: "medium" })}
									{" · "}
									{m.admin_customer_units({ count: order.units })}
								</span>
								<span className="justify-self-end">
									<OrderStatusBadge status={order.status} />
								</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</Section>
	);
}

export function CustomerProfile({
	detail,
	action,
}: {
	detail: AdminCustomer;
	action: ReactNode;
}) {
	const { customer } = detail;
	return (
		<Section title={m.admin_customer_profile()} action={action}>
			<dl className="grid gap-3 p-admin-card">
				<Fact label={m.admin_order_customer_name()} value={customer.name} />
				<Fact
					label={m.admin_customer_col_segment()}
					value={<CustomerSegmentBadge segment={customer.segment} />}
				/>
				<Fact
					label={m.admin_customer_account()}
					value={
						customer.hasAccount
							? m.admin_customer_has_account()
							: m.admin_customer_guest()
					}
				/>
				<Fact label={m.admin_field_phone()} value={customer.phoneE164} />
				<Fact label={m.admin_field_email()} value={customer.email} />
				<Fact label={m.admin_order_notes()} value={customer.notes} />
			</dl>
		</Section>
	);
}

export function CustomerConsents({ detail }: { detail: AdminCustomer }) {
	const formatDate = useStoreDate();
	const { consents, consentHistory } = detail;
	const when = (instant: string) =>
		formatDate(instant, { dateStyle: "medium", timeStyle: "short" });
	return (
		<Section title={m.admin_customer_consents()}>
			{consents.length === 0 ? (
				<p className="type-small p-admin-card text-muted-foreground">
					{m.admin_customer_consents_empty()}
				</p>
			) : (
				<>
					<ul>
						{consents.map((consent) => (
							<li
								key={consent.purpose}
								className="grid gap-0.5 border-b p-admin-card last:border-b-0"
							>
								<span className="type-small">
									{consentPurposeLabel[consent.purpose]()}
									{" · "}
									{consent.granted
										? m.admin_consent_granted()
										: m.admin_consent_revoked()}
								</span>
								<span className="type-meta text-muted-foreground">
									{when(consent.recordedAt)}
								</span>
							</li>
						))}
					</ul>
					<Accordion
						type="single"
						collapsible
						className="border-t px-admin-card"
					>
						<AccordionItem value="history">
							<AccordionTrigger>
								{m.admin_customer_consent_history()}
							</AccordionTrigger>
							<AccordionContent>
								<ol className="grid gap-3">
									{consentHistory.map((entry) => (
										<li key={entry.id} className="grid">
											<span className="type-small">
												{consentPurposeLabel[entry.purpose]()}
												{" · "}
												{entry.granted
													? m.admin_consent_granted()
													: m.admin_consent_revoked()}
											</span>
											<span className="type-meta text-muted-foreground">
												{when(entry.recordedAt)}
												{" · "}
												{consentChannelLabel[entry.channel]()}
											</span>
										</li>
									))}
								</ol>
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				</>
			)}
		</Section>
	);
}

export function CustomerAddresses({ detail }: { detail: AdminCustomer }) {
	const { addresses } = detail;
	return (
		<Section title={m.admin_customer_addresses()}>
			{addresses.length === 0 ? (
				<p className="type-small p-admin-card text-muted-foreground">
					{m.admin_customer_addresses_empty()}
				</p>
			) : (
				<ul>
					{addresses.map((address) => (
						<li
							key={address.id}
							data-archived={address.status === "archived"}
							className="grid gap-0.5 border-b p-admin-card last:border-b-0 data-[archived=true]:text-muted-foreground"
						>
							<span className="type-small flex flex-wrap items-center gap-2 font-bold">
								{address.recipientName}
								{address.isDefault && (
									<Badge variant="secondary">
										{m.admin_customer_address_default()}
									</Badge>
								)}
								{address.status === "archived" && (
									<Badge variant="outline">
										{m.admin_customer_address_archived()}
									</Badge>
								)}
							</span>
							<span className="type-small">{address.addressLine}</span>
							<span className="type-meta text-muted-foreground">
								{address.municipality}, {address.department}
								{" · "}
								{address.phoneE164}
							</span>
							{address.reference && (
								<span className="type-meta text-muted-foreground">
									{address.reference}
								</span>
							)}
						</li>
					))}
				</ul>
			)}
		</Section>
	);
}

export function CustomerReviews({ detail }: { detail: AdminCustomer }) {
	const formatDate = useStoreDate();
	return (
		<Section title={m.admin_customer_reviews()}>
			{detail.reviews.length === 0 ? (
				<p className="type-small p-admin-card text-muted-foreground">
					{m.admin_customer_reviews_empty()}
				</p>
			) : (
				<ul>
					{detail.reviews.map((review) => (
						<li
							key={review.id}
							className="grid gap-1 border-b p-admin-card last:border-b-0"
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<span className="type-small font-bold">
									{review.productName ?? m.admin_customer_review_product()}
								</span>
								<ToneBadge tone={reviewStatusTone[review.status]}>
									{reviewStatusLabel[review.status]()}
								</ToneBadge>
							</div>
							<span className="type-small">
								<span
									role="img"
									aria-label={m.admin_customer_review_rating({
										rating: review.rating,
									})}
									className="mr-2 text-warning"
								>
									{"★".repeat(review.rating)}
									<span className="text-muted-foreground">
										{"★".repeat(5 - review.rating)}
									</span>
								</span>
								{review.title}
							</span>
							<span className="type-meta text-muted-foreground">
								{formatDate(review.createdAt, { dateStyle: "medium" })}
							</span>
						</li>
					))}
				</ul>
			)}
		</Section>
	);
}
