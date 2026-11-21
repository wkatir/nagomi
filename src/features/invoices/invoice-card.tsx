import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { QueryError } from "#/components/admin/query-error";
import { Fact, Section } from "#/components/admin/section";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { useMoney } from "#/hooks/use-money";
import { useCalendarDate, useStoreDate } from "#/hooks/use-store-date";
import type { AdminOrder } from "#/lib/api";
import { storeToday } from "#/lib/dates";
import type { TaxDocumentStatus } from "#/lib/enums";
import { errorMessage } from "#/lib/errors";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { InvoiceStatusBadge } from "./invoice-status-badge";
import { IssueInvoiceDialog } from "./issue-invoice-dialog";
import { useCheckInvoice } from "./mutations";
import {
	type AdminInvoice,
	invoiceAttentionQuery,
	orderInvoicesQuery,
} from "./queries";
import { VoidInvoiceDialog } from "./void-invoice-dialog";

type Order = AdminOrder["order"];

// Hacienda usually seals within seconds; the cron follows anything slower.
const FOLLOW_EVERY_MS = 5_000;
const FOLLOW_TIMES = 12;

const ENDED: ReadonlySet<TaxDocumentStatus> = new Set([
	"rejected",
	"failed",
	"voided",
]);

// On its way or sealed; an order has one at most.
export const isLive = (doc: AdminInvoice) => !ENDED.has(doc.status);

const awaitsSeal = (status: TaxDocumentStatus) =>
	status === "queued" || status === "processing" || status === "contingency";

// Mirrors the API's rule for issuing a Factura.
const invoiceable = (order: Order) =>
	(order.status === "confirmed" ||
		order.status === "fulfilled" ||
		order.status === "delivered") &&
	order.paymentMethod !== null;

export const invoiceFileHref = (id: number, kind: "pdf" | "json") =>
	`/api/admin/invoices/${id}/${kind}`;

export function OrderInvoice({ order }: { order: Order }) {
	const documents = useQuery(orderInvoicesQuery(order.id));
	const attention = useQuery(invoiceAttentionQuery);
	const { data: store } = useSuspenseQuery(storeQuery);
	const [dialog, setDialog] = useState<"issue" | "void" | null>(null);

	if (documents.isPending || attention.isPending) return <InvoiceSkeleton />;
	if (documents.isError || attention.isError)
		return (
			<Section title={m.admin_invoice_card()}>
				<div className="p-admin-card">
					<QueryError
						error={documents.error ?? attention.error}
						onRetry={() => {
							documents.refetch();
							attention.refetch();
						}}
					/>
				</div>
			</Section>
		);

	const { configured } = attention.data;
	const [current, ...earlier] = documents.data.items;
	const canIssue =
		configured && invoiceable(order) && (!current || !isLive(current));
	const voidOpen =
		current?.voidDeadline != null &&
		storeToday(store.timeZone) <= current.voidDeadline;

	return (
		<>
			<Section
				title={m.admin_invoice_card()}
				action={
					canIssue ? (
						<Button
							size="sm"
							variant="outline"
							onClick={() => setDialog("issue")}
						>
							{m.admin_invoice_issue()}
						</Button>
					) : configured && current && awaitsSeal(current.status) ? (
						<CheckStatus key={current.id} doc={current} />
					) : current?.customerLink ? (
						<CopyMessage link={current.customerLink} locale={order.locale} />
					) : null
				}
			>
				{!configured && (
					<p className="type-small border-b p-admin-card text-muted-foreground last:border-b-0">
						{m.admin_invoice_not_configured()}
					</p>
				)}
				{current ? (
					<CurrentInvoice
						doc={current}
						voidOpen={voidOpen}
						onVoid={
							configured && voidOpen ? () => setDialog("void") : undefined
						}
					/>
				) : (
					configured && (
						<div className="grid gap-1 p-admin-card">
							<p className="type-small">{m.admin_invoice_none()}</p>
							{order.status !== "cancelled" && (
								<p className="type-meta text-muted-foreground">
									{m.admin_invoice_when()}
								</p>
							)}
						</div>
					)
				)}
				{earlier.length > 0 && <InvoiceHistory docs={earlier} />}
			</Section>
			{dialog === "issue" && (
				<IssueInvoiceDialog order={order} onClose={() => setDialog(null)} />
			)}
			{dialog === "void" && current?.voidDeadline && (
				<VoidInvoiceDialog
					doc={{ ...current, voidDeadline: current.voidDeadline }}
					onClose={() => setDialog(null)}
				/>
			)}
		</>
	);
}

function InvoiceSkeleton() {
	return (
		<Section title={m.admin_invoice_card()}>
			<div aria-busy className="grid gap-admin-stack p-admin-card">
				<Skeleton className="h-5 w-24" />
				<Skeleton className="h-9 w-full" />
				<Skeleton className="h-9 w-2/3" />
			</div>
		</Section>
	);
}

// Polls while processing, so the seal shows up without reloading.
function CheckStatus({ doc }: { doc: AdminInvoice }) {
	const check = useCheckInvoice(doc);
	const { mutate: follow } = useCheckInvoice(doc);
	useEffect(() => {
		if (doc.status !== "processing") return;
		let left = FOLLOW_TIMES;
		const timer = setInterval(() => {
			left -= 1;
			if (left === 0) clearInterval(timer);
			follow();
		}, FOLLOW_EVERY_MS);
		return () => clearInterval(timer);
	}, [doc.status, follow]);
	return (
		<Button
			size="sm"
			variant="outline"
			disabled={check.isPending}
			onClick={() =>
				check.mutate(undefined, {
					onError: (error) => toast.error(errorMessage(error)),
				})
			}
		>
			{check.isPending && <Spinner aria-hidden />}
			{m.admin_invoice_check()}
		</Button>
	);
}

// The message is in the language the customer ordered in, not the admin's.
function CopyMessage({
	link,
	locale,
}: {
	link: string;
	locale: Order["locale"];
}) {
	return (
		<Button
			type="button"
			size="sm"
			variant="outline"
			onClick={async () => {
				try {
					await navigator.clipboard.writeText(
						m.admin_invoice_customer_message({ link }, { locale }),
					);
					toast.success(m.admin_order_message_copied());
				} catch {
					toast.error(m.error_generic());
				}
			}}
		>
			<CopyIcon aria-hidden />
			{m.admin_order_copy_message()}
		</Button>
	);
}

function Downloads({ id }: { id: number }) {
	return (
		<div className="flex flex-wrap gap-2">
			<Button size="sm" variant="outline" asChild>
				<a href={invoiceFileHref(id, "pdf")} download>
					<DownloadIcon aria-hidden />
					{m.admin_invoice_pdf()}
				</a>
			</Button>
			<Button size="sm" variant="outline" asChild>
				<a href={invoiceFileHref(id, "json")} download>
					<DownloadIcon aria-hidden />
					{m.admin_invoice_json()}
				</a>
			</Button>
		</div>
	);
}

function CurrentInvoice({
	doc,
	voidOpen,
	onVoid,
}: {
	doc: AdminInvoice;
	voidOpen: boolean;
	onVoid?: () => void;
}) {
	const money = useMoney();
	const formatDay = useCalendarDate();
	return (
		<div className="grid gap-admin-stack p-admin-card">
			<dl className="grid gap-admin-stack">
				<Fact
					label={m.admin_col_status()}
					value={<InvoiceStatusBadge status={doc.status} />}
				/>
				<Fact
					label={m.admin_invoice_control_number()}
					value={doc.controlNumber}
				/>
				<Fact
					label={m.admin_invoice_generation_code()}
					value={doc.generationCode}
				/>
				<Fact
					label={m.admin_invoice_seal()}
					value={doc.seal && <span className="break-all">{doc.seal}</span>}
				/>
				<Fact
					label={m.admin_invoice_issued_on()}
					value={doc.issuedOn && formatDay(doc.issuedOn)}
				/>
				<Fact
					label={m.admin_col_total()}
					value={money(doc.total ?? doc.expectedTotal)}
				/>
			</dl>
			<InvoiceProblem doc={doc} />
			{(doc.status === "sealed" || doc.filed) && <Downloads id={doc.id} />}
			{doc.status === "sealed" &&
				doc.voidDeadline &&
				(doc.voidReason ? (
					<p className="type-meta text-muted-foreground">
						{m.admin_invoice_void_requested({ reason: doc.voidReason })}
					</p>
				) : (
					<div className="flex flex-wrap items-center justify-between gap-2 border-t pt-admin-stack">
						<p className="type-meta text-muted-foreground">
							{voidOpen
								? m.admin_invoice_void_until({
										date: formatDay(doc.voidDeadline),
									})
								: m.admin_invoice_void_closed({
										date: formatDay(doc.voidDeadline),
									})}
						</p>
						{onVoid && (
							<Button size="sm" variant="outline" onClick={onVoid}>
								{m.admin_invoice_void()}
							</Button>
						)}
					</div>
				))}
		</div>
	);
}

function problemOf(doc: AdminInvoice, money: (amount: number) => string) {
	if (doc.error?.startsWith("total_mismatch") && doc.total !== null)
		return m.admin_invoice_total_mismatch({
			total: money(doc.total),
			expected: money(doc.expectedTotal),
		});
	return doc.error;
}

function InvoiceProblem({ doc }: { doc: AdminInvoice }) {
	const money = useMoney();
	const rejection = doc.rejection ?? [];
	const error = problemOf(doc, money);
	if (!error && rejection.length === 0) return null;
	return (
		<Alert variant="destructive">
			<AlertTitle>
				{doc.status === "rejected"
					? m.admin_invoice_rejected_title()
					: doc.status === "failed"
						? m.admin_invoice_failed_title()
						: doc.status === "queued"
							? m.admin_invoice_waiting_title()
							: m.admin_invoice_problem_title()}
			</AlertTitle>
			<AlertDescription className="break-words">
				{rejection.map((r) => (
					<div key={`${r.donde}:${r.problema}`} className="grid gap-0.5">
						<p>
							{r.problema}
							{r.donde && ` (${r.donde})`}
						</p>
						<p>{m.admin_invoice_rejection_action({ action: r.accion })}</p>
					</div>
				))}
				{error && <p>{error}</p>}
			</AlertDescription>
		</Alert>
	);
}

function InvoiceHistory({ docs }: { docs: AdminInvoice[] }) {
	const formatDate = useStoreDate();
	return (
		<Accordion type="single" collapsible className="border-t px-admin-card">
			<AccordionItem value="history" className="border-b-0">
				<AccordionTrigger>{m.admin_invoice_history()}</AccordionTrigger>
				<AccordionContent>
					<ul className="grid gap-admin-stack">
						{docs.map((doc) => {
							const why =
								doc.voidReason ?? doc.rejection?.[0]?.problema ?? doc.error;
							return (
								<li key={doc.id} className="grid gap-1">
									<div className="flex flex-wrap items-center gap-2">
										<InvoiceStatusBadge status={doc.status} />
										<span className="type-meta text-muted-foreground">
											{formatDate(doc.createdAt, {
												dateStyle: "medium",
												timeStyle: "short",
											})}
										</span>
									</div>
									{doc.controlNumber && (
										<span className="type-meta break-words">
											{doc.controlNumber}
										</span>
									)}
									{why && (
										<span className="type-small break-words text-muted-foreground">
											{why}
										</span>
									)}
									{doc.filed && <Downloads id={doc.id} />}
								</li>
							);
						})}
					</ul>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}
