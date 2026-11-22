import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import {
	BankTransferBox,
	OrderSummary,
	OrderTimeline,
	orderStatusText,
} from "#/components/store/order-view";
import { StoreButton } from "#/components/store/ui/store-button";
import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { useMoney } from "#/hooks/use-money";
import { api, apiErrorOf, parseResponse } from "#/lib/api";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";

// Confirmation after checkout (?nuevo=1), the return from the card payment page
// (?pago=tarjeta) and the tracking page. It always reads the order from the API: the query
// string never decides what is shown.
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
			search.pago && q.state.data?.status === "pending" ? 5000 : false,
	});
	const money = useMoney();
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
			<div className="container-page max-w-md py-14">
				<h1 className="type-h2">{m.order_lookup_title()}</h1>
				<p className="mt-2 text-muted-foreground">{m.order_lookup_body()}</p>
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
		);
	}
	const o = order.data;
	return (
		<div className="container-page grid grid-cols-[1fr_360px] gap-14 py-14 max-md:grid-cols-1 max-md:gap-8 max-md:py-8">
			<div className="grid content-start gap-6">
				{search.nuevo ? (
					<h1 className="type-h2">
						{m.order_thanks({ name: o.customerName })}
					</h1>
				) : (
					<h1 className="type-h2">{m.order_page_title({ code: o.code })}</h1>
				)}
				<dl className="flex flex-wrap gap-x-8 gap-y-2">
					<div>
						<dt className="type-meta text-muted-foreground">
							{m.order_code_label()}
						</dt>
						<dd className="type-h4 tabular-nums">{o.code}</dd>
					</div>
					<div>
						<dt className="type-meta text-muted-foreground">
							{m.order_status_label()}
						</dt>
						<dd className="type-h4">{orderStatusText[o.status]()}</dd>
					</div>
					<div>
						<dt className="type-meta text-muted-foreground">
							{m.cart_total()}
						</dt>
						<dd className="type-h4 tabular-nums">{money(o.total)}</dd>
					</div>
				</dl>
				{o.paymentMethod === "card" && o.status === "pending" && (
					<section className="grid gap-3 border p-5">
						{search.pago && <p>{m.order_card_waiting()}</p>}
						{o.cardPaymentAvailable ? (
							<StoreButton
								pending={pay.isPending}
								onClick={() =>
									o.paymentUrl
										? window.location.assign(o.paymentUrl)
										: pay.mutate()
								}
							>
								{m.order_card_pay()}
							</StoreButton>
						) : (
							<p className="text-muted-foreground">
								{m.order_card_unavailable()}
							</p>
						)}
						{pay.isError && <FieldError>{errorMessage(pay.error)}</FieldError>}
					</section>
				)}
				{o.paymentMethod === "card" && o.paid && search.pago && (
					<p className="text-success">{m.order_card_paid()}</p>
				)}
				{o.bankTransfer && (
					<BankTransferBox transfer={o.bankTransfer} total={o.total} />
				)}
				{o.paymentMethod === "cash_on_delivery" &&
					!o.paid &&
					o.status !== "cancelled" && (
						<p>{m.order_cod_note({ amount: money(o.total) })}</p>
					)}
				<OrderSummary order={o} />
				{search.nuevo && (
					<p className="type-small">
						<Link
							to="/pedido/$code"
							params={{ code: o.code }}
							className="underline underline-offset-4"
						>
							{m.order_tracking_link()}
						</Link>
					</p>
				)}
			</div>
			<aside className="h-fit border p-6">
				<h2 className="mb-4 type-h4">{m.order_timeline()}</h2>
				<OrderTimeline order={o} />
			</aside>
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
			className="mt-6 grid gap-3"
			onSubmit={(e) => {
				e.preventDefault();
				if (value.trim()) onSubmit(value.trim());
			}}
		>
			<Field className="gap-1.5">
				<FieldLabel htmlFor="lookup-email">{m.checkout_email()}</FieldLabel>
				<Input
					id="lookup-email"
					type="email"
					inputMode="email"
					autoComplete="email"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					aria-invalid={error ? true : undefined}
				/>
				{error && <FieldError>{error}</FieldError>}
			</Field>
			<StoreButton type="submit">{m.order_lookup_submit()}</StoreButton>
		</form>
	);
}
