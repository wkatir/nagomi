import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import {
	Heart,
	LogOut,
	MessageSquareText,
	Package,
	UserRound,
} from "lucide-react";
import type * as React from "react";
import { StoreButton } from "#/components/store/ui/store-button";
import { FieldError } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { authClient } from "#/lib/auth-client";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";

const item =
	"flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 type-small text-foreground-secondary hover:bg-accent/60 hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground";

export function AccountShell({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: React.ReactNode;
}) {
	const session = authClient.useSession();
	const path = useRouterState({ select: (s) => s.location.pathname });
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const signOut = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.signOut();
			if (error) throw new Error(error.message ?? "sign_out_failed");
		},
		onSuccess: async () => {
			queryClient.removeQueries({ queryKey: ["account"] });
			queryClient.removeQueries({ queryKey: ["cart"] });
			await navigate({ to: "/" });
		},
	});
	if (session.isPending)
		return (
			<div className="container-page py-14">
				<Spinner aria-label={m.loading()} className="text-muted-foreground" />
			</div>
		);
	if (session.data?.user.role !== "customer") return <SignedOut />;
	const current = (href: string) => (path === href ? "page" : undefined);
	return (
		<div className="container-page pt-6 md:pt-8">
			<div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
				<nav aria-label={m.account_nav()} className="lg:pt-1">
					<div className="flex items-center gap-3 px-1 pb-4 max-lg:hidden">
						<span className="flex size-10 items-center justify-center rounded-full bg-accent type-small font-semibold text-brand">
							{session.data.user.name.slice(0, 1).toUpperCase()}
						</span>
						<span className="min-w-0">
							<span className="block truncate type-small font-medium">
								{session.data.user.name}
							</span>
							<span className="block truncate type-meta text-muted-foreground">
								{session.data.user.email}
							</span>
						</span>
					</div>
					<ul className="flex gap-1 overflow-x-auto pb-1 lg:grid lg:overflow-visible">
						<li>
							<Link
								to="/account"
								activeOptions={{ exact: true }}
								className={item}
								aria-current={current("/account")}
							>
								<UserRound aria-hidden className="size-[1.125rem]" />
								{m.account_profile_nav()}
							</Link>
						</li>
						<li>
							<Link
								to="/account"
								hash="orders"
								activeOptions={{ exact: true, includeHash: true }}
								className={item}
							>
								<Package aria-hidden className="size-[1.125rem]" />
								{m.account_orders()}
							</Link>
						</li>
						<li>
							<Link
								to="/account/wishlist"
								className={item}
								aria-current={current("/account/wishlist")}
							>
								<Heart aria-hidden className="size-[1.125rem]" />
								{m.wishlist_title()}
							</Link>
						</li>
						<li>
							<Link
								to="/account/reviews"
								className={item}
								aria-current={current("/account/reviews")}
							>
								<MessageSquareText aria-hidden className="size-[1.125rem]" />
								{m.reviews_mine_title()}
							</Link>
						</li>
						<li className="lg:mt-3 lg:border-t lg:pt-3">
							<StoreButton
								variant="link"
								pending={signOut.isPending}
								onClick={() => signOut.mutate()}
								className={cn(
									item,
									"w-full justify-start font-normal no-underline has-[>svg]:px-3",
								)}
							>
								<LogOut aria-hidden className="size-[1.125rem]" />
								{m.account_sign_out()}
							</StoreButton>
						</li>
					</ul>
					{signOut.isError && (
						<FieldError className="mt-2">
							{errorMessage(signOut.error)}
						</FieldError>
					)}
				</nav>
				<div className="min-w-0">
					<h1 className="type-h1">{title}</h1>
					{description && (
						<p className="mt-1 max-w-[65ch] type-small text-muted-foreground">
							{description}
						</p>
					)}
					<div className="mt-5">{children}</div>
				</div>
			</div>
		</div>
	);
}

function SignedOut() {
	return (
		<div className="container-page pt-8">
			<div className="panel mx-auto max-w-md p-6 text-center">
				<span className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-brand">
					<UserRound aria-hidden className="size-6" />
				</span>
				<h1 className="mt-4 type-h2">{m.account_title()}</h1>
				<p className="mt-2 type-small text-foreground-secondary">
					{m.account_signed_out()}
				</p>
				<div className="mt-6 grid gap-3">
					<StoreButton asChild size="lg">
						<Link to="/account/sign-in">{m.account_sign_in()}</Link>
					</StoreButton>
					<StoreButton asChild size="lg" variant="outline">
						<Link to="/account/sign-up">{m.account_sign_up()}</Link>
					</StoreButton>
				</div>
			</div>
		</div>
	);
}
