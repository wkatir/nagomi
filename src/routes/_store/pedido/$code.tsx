import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Banknote, CircleCheck, CreditCard, PackageSearch } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { DemoNotice } from "#/components/store/demo-notice";
import { TextField } from "#/components/store/form-fields";
import {
	BankTransferBox,
	OrderDelivery,
	OrderStatusBadge,
	OrderSummary,
	OrderTimeline,
} from "#/components/store/order-view";
import { StoreButton } from "#/components/store/ui/store-button";
import { FieldError } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { useMoney } from "#/hooks/use-money";
import { useStoreDate } from "#/hooks/use-store-date";
import { api, apiErrorOf, parseResponse } from "#/lib/api";
import { errorMessage } from "#/lib/errors";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/_store/pedido/$code")({
	staticData: { noindex: true },
	validateSearch: z.object({
		nuevo: z.coerce.number().optional(),
		pago: z.string().optional(),
	}),
	head: ({ params }) => ({
		meta: [{ title: m.order_page_title({ code: params.code }) }],
	}),
	component: OrderPage,
});

function OrderPage() {
	const { code } = Route.useParams();
	const search = Route.useSearch();
	const [email, setEmail] = useState<string | undefined>(undefined);
	const order = useQuery({
		queryKey: ["order", code, email ?? null],
		queryFn: () =>
			parseResponse(
				api().orders[":code"].$get({
					param: { code },
					query: email ? { email } : {},
				}),
			),
		retry: false,
		refetchInterval: (q) =>
			search.pago &&
			q.state.data?.status === "pending" &&
			!q.state.data.cardDeclined
				? 5000
				: false,
	});
	const { data: store } = useSuspenseQuery(storeQuery);
	const money = useMoney();
	const formatDate = useStoreDate();
	const pay = useMutation({
		mutationFn: () =>
			parseResponse(
				api().orders[":code"].pay.$post({
					param: { code },
					json: email ? { email } : {},
				}),
			),
		onSuccess: ({ redirectUrl }) => window.location.assign(redirectUrl),
	});

	if (order.isPending)
		return (
			<div className="container-page py-14">
				<Spinner aria-label={m.loading()} className="text-muted-foreground" />
			</div>
		);
	if (order.isError) {
		const notFound = apiErrorOf(order.error)?.status === 404;
		return (
			<div className="container-page pt-8">
				<div className="panel mx-auto max-w-md p-6">
					<span className="flex size-12 items-center justify-center rounded-full bg-accent text-brand">
						<PackageSearch aria-hidden className="size-6" />
					</span>
					<h1 className="mt-4 type-h2">{m.order_lookup_title()}</h1>
					<p className="mt-1 type-small text-muted-foreground">
						{m.order_lookup_body()}
					</p>
					<LookupForm
						onSubmit={setEmail}
						error={
							email && notFound
								? m.order_not_found()
								: notFound
									? null
									: errorMessage(order.error)
						}
					/>
				</div>
			</div>
		);
	}
	const o = order.data;
	const placedAt = o.history.find((h) => h.to === "pending")?.at;
	return (
		<div className="container-page pt-6 md:pt-8">
			{search.nuevo ? (
				<div className="panel relative mb-5 flex items-start gap-4 overflow-hidden p-5 md:p-6">
					<div
						aria-hidden
						className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(ellipse_at_right,rgb(139_124_246/0.2),transparent_70%)]"
					/>
					<span className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
						<CircleCheck aria-hidden className="size-6" />
					</span>
					<div className="relative">
						<h1 className="type-h1">
							{m.order_thanks({ name: o.customerName.split(" ")[0] })}
						</h1>
						<p className="mt-1 type-small text-foreground-secondary">
							{m.order_confirmation_next()}
						</p>
					</div>
				</div>
			) : (
				<h1 className="mb-4 type-h1">{m.order_page_title({ code: o.code })}</h1>
			)}

			<DemoNotice
				message={
					o.paymentMethod === "bank_transfer"
						? m.order_demo_transfer()
						: o.paymentMethod === "cash_on_delivery"
							? m.order_demo_cod()
							: o.cardProvider === "demo"
								? m.order_demo_card()
								: undefined
				}
				className="mb-4"
			/>
			<div className="panel flex flex-wrap items-center gap-x-8 gap-y-3 p-4 md:px-5">
				<Meta label={m.order_code_label()}>
					<span className="font-semibold tabular-nums">{o.code}</span>
				</Meta>
				{placedAt && (
					<Meta label={m.order_placed_label()}>
						{formatDate(placedAt, { dateStyle: "medium" })}
					</Meta>
				)}
				<Meta label={m.cart_total()}>
					<span className="font-semibold tabular-nums">{money(o.total)}</span>
				</Meta>
				<Meta label={m.order_status_label()}>
					<OrderStatusBadge status={o.status} />
				</Meta>
			</div>

			<section aria-labelledby="timeline-title" className="panel mt-4 p-5">
				<h2 id="timeline-title" className="mb-5 type-h3">
					{m.order_timeline()}
				</h2>
				<OrderTimeline
					status={o.status}
					paymentMethod={o.paymentMethod}
					history={o.history}
				/>
				{o.status === "cancelled" && o.cancelReason && (
					<p className="mt-4 type-small text-muted-foreground">
						{m.order_cancel_reason({ reason: o.cancelReason })}
					</p>
				)}
			</section>

			<div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-6">
				<div className="grid content-start gap-4">
					{o.paymentMethod === "card" && o.status === "pending" && (
						<section className="panel grid gap-3 border-primary/40 p-5">
							<h2 className="flex items-center gap-2 type-h3">
								<CreditCard aria-hidden className="size-5 text-brand" />
								{m.order_card_title()}
							</h2>
							{o.cardDeclined ? (
								<p role="alert" className="type-small text-destructive">
									{m.order_card_declined()}
								</p>
							) : (
								search.pago && (
									<p className="type-small">
										{o.cardProvider === "demo"
											? m.order_card_waiting_demo()
											: m.order_card_waiting()}
									</p>
								)
							)}
							{o.cardPaymentAvailable ? (
								<StoreButton
									size="lg"
									pending={pay.isPending}
									onClick={() =>
										o.paymentUrl
											? window.location.assign(o.paymentUrl)
											: pay.mutate()
									}
									className="justify-self-start"
								>
									{m.order_card_pay()}
								</StoreButton>
							) : (
								<p className="type-small text-muted-foreground">
									{m.order_card_unavailable()}
								</p>
							)}
							{pay.isError && (
								<FieldError>{errorMessage(pay.error)}</FieldError>
							)}
						</section>
					)}
					{o.paymentMethod === "card" && o.paid && search.pago && (
						<output className="block panel p-4 type-small text-success">
							{m.order_card_paid()}
						</output>
					)}
					{o.bankTransfer && (
						<BankTransferBox transfer={o.bankTransfer} total={o.total} />
					)}
					{o.paymentMethod === "cash_on_delivery" &&
						!store.demoStore &&
						!o.paid &&
						o.status !== "cancelled" && (
							<p className="panel flex items-start gap-3 p-5 type-small">
								<Banknote aria-hidden className="size-5 shrink-0 text-brand" />
								{m.order_cod_note({ amount: money(o.total) })}
							</p>
						)}
					<section aria-labelledby="delivery-title" className="panel p-5">
						<h2 id="delivery-title" className="mb-4 type-h3">
							{m.order_delivery_title()}
						</h2>
						<OrderDelivery order={o} />
					</section>
					{search.nuevo && (
						<p className="type-small text-muted-foreground">
							{m.order_tracking_hint()}{" "}
							<Link
								to="/pedido/$code"
								params={{ code: o.code }}
								className="text-foreground underline underline-offset-4"
							>
								{m.order_tracking_link()}
							</Link>
						</p>
					)}
				</div>
				<aside
					aria-labelledby="order-summary-title"
					className="panel h-fit p-5 lg:sticky lg:top-[calc(var(--header-height)+1.25rem)]"
				>
					<h2 id="order-summary-title" className="mb-4 type-h3">
						{m.checkout_summary()}
					</h2>
					<OrderSummary order={o} />
				</aside>
			</div>
		</div>
	);
}

function Meta({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="grid gap-0.5">
			<span className="type-meta text-muted-foreground">{label}</span>
			<span className="type-small">{children}</span>
		</div>
	);
}

function LookupForm({
	onSubmit,
	error,
}: {
	onSubmit: (email: string) => void;
	error: string | null;
}) {
	const [value, setValue] = useState("");
	return (
		<form
			className="mt-5 grid gap-4"
			onSubmit={(e) => {
				e.preventDefault();
				if (value.trim()) onSubmit(value.trim());
			}}
		>
			<TextField
				id="lookup-email"
				label={m.checkout_email()}
				type="email"
				inputMode="email"
				autoComplete="email"
				value={value}
				onChange={setValue}
				error={error}
			/>
			<StoreButton type="submit" size="lg">
				{m.order_lookup_submit()}
			</StoreButton>
		</form>
	);
}
