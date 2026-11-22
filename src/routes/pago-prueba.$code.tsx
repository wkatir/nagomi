import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CreditCard, FlaskConical, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { LogoMark } from "#/components/brand/wordmark";
import { TextField } from "#/components/store/form-fields";
import { StoreButton } from "#/components/store/ui/store-button";
import { Button } from "#/components/ui/button";
import { FieldError } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { useIdempotencyKey } from "#/hooks/use-idempotency-key";
import { useMoney } from "#/hooks/use-money";
import { api, apiErrorOf, parseResponse } from "#/lib/api";
import { errorMessage } from "#/lib/errors";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/pago-prueba/$code")({
	staticData: { noindex: true },
	loader: ({ context }) => context.queryClient.ensureQueryData(storeQuery),
	head: ({ params }) => ({
		meta: [{ title: m.demo_pay_page_title({ code: params.code }) }],
	}),
	component: DemoPaymentPage,
});

const TEST_CARDS = [
	{ number: "4242 4242 4242 4242", brand: "Visa", approved: true },
	{ number: "4000 0000 0000 0002", brand: "Visa", approved: false },
	{ number: "5555 5555 5555 4444", brand: "Mastercard", approved: true },
] as const;

const FIELD_MESSAGES: Record<string, Record<string, () => string>> = {
	cardNumber: {
		invalid: m.demo_pay_error_card_invalid,
		not_test_card: m.demo_pay_error_card_not_test,
	},
	expiry: {
		invalid: m.demo_pay_error_expiry_invalid,
		expired: m.demo_pay_error_expiry_expired,
	},
	cvc: { invalid: m.demo_pay_error_cvc_invalid },
};

const groupDigits = (value: string) =>
	value
		.replace(/\D/g, "")
		.slice(0, 19)
		.replace(/(\d{4})(?=\d)/g, "$1 ");

const expiryText = (value: string) => {
	const digits = value.replace(/\D/g, "").slice(0, 4);
	return digits.length > 2
		? `${digits.slice(0, 2)}/${digits.slice(2)}`
		: digits;
};

function DemoPaymentPage() {
	const { code } = Route.useParams();
	const { data: store } = useSuspenseQuery(storeQuery);
	const money = useMoney();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const order = useQuery({
		queryKey: ["order", code, null],
		queryFn: () =>
			parseResponse(api().orders[":code"].$get({ param: { code }, query: {} })),
		retry: false,
	});
	const [number, setNumber] = useState("");
	const [expiry, setExpiry] = useState("");
	const [cvc, setCvc] = useState("");
	const [holder, setHolder] = useState("");
	const card = { number, expiry, cvc };
	const attempt = useIdempotencyKey(card);
	const pay = useMutation({
		mutationFn: (amount: number) =>
			parseResponse(
				api().orders[":code"]["demo-payment"].$post({
					param: { code },
					json: { ...card, amount, attempt },
				}),
			),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["order", code] });
			await navigate({
				to: "/pedido/$code",
				params: { code },
				search: { pago: "tarjeta" },
			});
		},
	});
	const failure = apiErrorOf(pay.error);
	const fields =
		failure?.code === "invalid_fields"
			? (failure.body.fields as Record<string, string>)
			: {};
	const fieldError = (field: string) =>
		fields[field] === undefined
			? null
			: (FIELD_MESSAGES[field]?.[fields[field]] ?? m.error_generic)();

	const o = order.data;
	const payable =
		o?.status === "pending" &&
		o.paymentMethod === "card" &&
		o.cardProvider === "demo";

	return (
		<div className="min-h-dvh bg-muted/40 px-4 py-6 md:py-10">
			<div className="mx-auto grid max-w-md gap-4">
				<p
					role="note"
					className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 type-small font-medium"
				>
					<FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0" />
					{m.demo_pay_banner()}
				</p>
				<section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
					<header className="flex items-center justify-between gap-3 border-b bg-background px-5 py-4">
						<span className="flex items-center gap-2 type-ui font-semibold">
							<ShieldCheck aria-hidden className="size-5 text-success" />
							{m.demo_pay_title()}
						</span>
						<span className="flex items-center gap-1.5 type-meta text-muted-foreground">
							<Lock aria-hidden className="size-3.5" />
							{code}
						</span>
					</header>
					{order.isPending ? (
						<div className="p-8">
							<Spinner
								aria-label={m.loading()}
								className="text-muted-foreground"
							/>
						</div>
					) : !o || !payable ? (
						<div className="grid gap-4 p-5">
							<p className="type-small">
								{order.isError && apiErrorOf(order.error)?.status !== 404
									? errorMessage(order.error)
									: o && o.cardProvider !== "demo" && o.status === "pending"
										? m.demo_pay_unavailable()
										: m.demo_pay_not_payable()}
							</p>
							<StoreButton asChild variant="outline">
								<Link to="/pedido/$code" params={{ code }}>
									{m.demo_pay_back()}
								</Link>
							</StoreButton>
						</div>
					) : (
						<>
							<dl className="grid grid-cols-2 gap-3 border-b px-5 py-4">
								<div className="col-span-2 flex items-center gap-3">
									<LogoMark label={store.name} className="size-9 text-brand" />
									<div>
										<dt className="type-meta text-muted-foreground">
											{m.demo_pay_merchant()}
										</dt>
										<dd className="type-ui font-semibold">{store.name}</dd>
									</div>
								</div>
								<div>
									<dt className="type-meta text-muted-foreground">
										{m.demo_pay_order()}
									</dt>
									<dd className="type-ui font-semibold tabular-nums">
										{o.code}
									</dd>
								</div>
								<div className="text-right">
									<dt className="type-meta text-muted-foreground">
										{m.demo_pay_amount()}
									</dt>
									<dd className="type-h3 tabular-nums">{money(o.total)}</dd>
								</div>
							</dl>
							<form
								noValidate
								className="grid gap-4 px-5 py-5"
								onSubmit={(e) => {
									e.preventDefault();
									pay.mutate(o.total);
								}}
							>
								<TextField
									id="card-number"
									label={m.demo_pay_card_number()}
									value={number}
									onChange={(v) => setNumber(groupDigits(v))}
									inputMode="numeric"
									autoComplete="off"
									placeholder="4242 4242 4242 4242"
									error={fieldError("cardNumber")}
								/>
								<TextField
									id="card-holder"
									label={m.demo_pay_name()}
									value={holder}
									onChange={setHolder}
									autoComplete="off"
								/>
								<div className="grid grid-cols-2 gap-4">
									<TextField
										id="card-expiry"
										label={m.demo_pay_expiry()}
										value={expiry}
										onChange={(v) => setExpiry(expiryText(v))}
										inputMode="numeric"
										autoComplete="off"
										placeholder="12/30"
										error={fieldError("expiry")}
									/>
									<TextField
										id="card-cvc"
										label={m.demo_pay_cvc()}
										value={cvc}
										onChange={(v) => setCvc(v.replace(/\D/g, "").slice(0, 4))}
										inputMode="numeric"
										autoComplete="off"
										placeholder="123"
										error={fieldError("cvc")}
									/>
								</div>
								{pay.isError && failure?.code !== "invalid_fields" && (
									<FieldError>{errorMessage(pay.error)}</FieldError>
								)}
								<StoreButton
									type="submit"
									size="lg"
									fullWidth
									pending={pay.isPending}
								>
									<CreditCard aria-hidden className="size-4" />
									{pay.isPending
										? m.demo_pay_paying()
										: m.demo_pay_submit({ amount: money(o.total) })}
								</StoreButton>
								<StoreButton asChild variant="outline" fullWidth>
									<Link to="/pedido/$code" params={{ code }}>
										{m.demo_pay_cancel()}
									</Link>
								</StoreButton>
								<p className="type-meta text-muted-foreground">
									{m.demo_pay_no_storage()}
								</p>
							</form>
						</>
					)}
				</section>
				{payable && (
					<section
						aria-labelledby="test-cards-title"
						className="rounded-2xl border bg-card p-5"
					>
						<h2 id="test-cards-title" className="type-ui font-semibold">
							{m.demo_pay_test_cards()}
						</h2>
						<p className="mt-1 type-meta text-muted-foreground">
							{m.demo_pay_test_cards_hint()}
						</p>
						<ul className="mt-3 grid gap-2">
							{TEST_CARDS.map((t) => (
								<li key={t.number}>
									<Button
										type="button"
										variant="outline"
										onClick={() => {
											setNumber(t.number);
											if (!expiry) setExpiry("12/30");
											if (!cvc) setCvc("123");
										}}
										className="h-auto w-full justify-between gap-3 rounded-lg px-3 py-2 text-left hover:border-primary"
									>
										<span className="type-small font-medium tabular-nums">
											{t.number}
											<span className="ml-2 type-meta text-muted-foreground">
												{t.brand}
											</span>
										</span>
										<span
											className={
												t.approved
													? "type-meta font-semibold text-success"
													: "type-meta font-semibold text-destructive"
											}
										>
											{t.approved
												? m.demo_pay_card_approved()
												: m.demo_pay_card_declined()}
										</span>
									</Button>
								</li>
							))}
						</ul>
					</section>
				)}
			</div>
		</div>
	);
}
