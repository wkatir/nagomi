import { MoreHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { DetailColumns, DetailPage } from "#/components/admin/detail-layout";
import { HeaderActions, PageHeader } from "#/components/admin/page-header";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { useStoreDate } from "#/hooks/use-store-date";
import { whatsappLink } from "#/lib/whatsapp";
import { m } from "#/paraglide/messages";
import { customerLabel } from "./columns";
import {
	CustomerConsents,
	CustomerOrders,
	CustomerProfile,
	CustomerSummary,
} from "./customer-sections";
import { EditCustomerDialog } from "./edit-customer-dialog";
import type { AdminCustomer } from "./queries";

type Contact = { key: string; label: string; href: string; external: boolean };

// Order matters: the first is the page's main button, the rest sit under "more".
export function contactsOf({
	phoneE164,
	email,
}: Pick<AdminCustomer["customer"], "phoneE164" | "email">) {
	const contacts: Contact[] = [];
	if (phoneE164) {
		contacts.push(
			{
				key: "whatsapp",
				label: m.admin_customer_whatsapp(),
				href: whatsappLink(phoneE164.replace(/\D/g, ""), ""),
				external: true,
			},
			{
				key: "call",
				label: m.admin_customer_call(),
				href: `tel:${phoneE164}`,
				external: false,
			},
		);
	}
	if (email)
		contacts.push({
			key: "email",
			label: m.admin_customer_email_action(),
			href: `mailto:${email}`,
			external: false,
		});
	return contacts;
}

function ContactActions({ customer }: { customer: AdminCustomer["customer"] }) {
	const [main, ...more] = contactsOf(customer);
	if (!main) return null;
	return (
		<HeaderActions>
			<Button className="max-sm:flex-1" asChild>
				<a
					href={main.href}
					{...(main.external ? { target: "_blank", rel: "noreferrer" } : {})}
				>
					{main.label}
				</a>
			</Button>
			{more.length > 0 && (
				<DropdownMenu modal={false}>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							size="icon"
							aria-label={m.admin_customer_more_actions()}
						>
							<MoreHorizontalIcon aria-hidden />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{more.map((contact) => (
							<DropdownMenuItem key={contact.key} asChild>
								<a href={contact.href}>{contact.label}</a>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</HeaderActions>
	);
}

export function CustomerDetail({ detail }: { detail: AdminCustomer }) {
	const { customer } = detail;
	const [editing, setEditing] = useState(false);
	const formatDate = useStoreDate();
	return (
		<DetailPage>
			<PageHeader
				title={customerLabel(customer)}
				description={m.admin_customer_since({
					date: formatDate(customer.createdAt, { dateStyle: "long" }),
				})}
				action={<ContactActions customer={customer} />}
			/>
			<DetailColumns
				aside={
					<>
						<CustomerProfile
							detail={detail}
							action={
								<Button
									size="sm"
									variant="outline"
									onClick={() => setEditing(true)}
								>
									{m.admin_edit()}
								</Button>
							}
						/>
						<CustomerConsents detail={detail} />
					</>
				}
			>
				<CustomerSummary detail={detail} />
				<CustomerOrders detail={detail} />
			</DetailColumns>
			{editing && (
				<EditCustomerDialog
					customer={customer}
					onClose={() => setEditing(false)}
				/>
			)}
		</DetailPage>
	);
}
