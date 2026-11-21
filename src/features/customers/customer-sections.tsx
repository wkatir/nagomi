import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
	consentChannelLabel,
	consentPurposeLabel,
	orderStatusLabel,
} from "#/components/admin/labels";
import { Fact, Section } from "#/components/admin/section";
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
								<Badge
									variant={
										order.status === "pending"
											? "secondary"
											: order.status === "cancelled"
												? "outline"
												: "default"
									}
									className="justify-self-end"
								>
									{orderStatusLabel[order.status]()}
								</Badge>
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
