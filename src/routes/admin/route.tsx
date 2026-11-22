import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import {
	createFileRoute,
	Outlet,
	redirect,
	useRouter,
} from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminShell } from "#/components/admin/admin-shell";
import { StaffAccessProvider } from "#/components/admin/staff-access";
import { useAdminTheme } from "#/components/admin/use-admin-theme";
import { Button } from "#/components/ui/button";
import { FieldError } from "#/components/ui/field";
import { Toaster } from "#/components/ui/sonner";
import { authClient } from "#/lib/auth-client";
import { errorMessage } from "#/lib/errors";
import { storeQuery } from "#/lib/queries";
import { isAdmin, isStaff } from "#/lib/roles";
import { m } from "#/paraglide/messages";

// Every admin API call is also checked on the server (src/server/auth.ts); this guard only
// decides what to show.
export const Route = createFileRoute("/admin")({
	ssr: false,
	staticData: { noindex: true, crumb: m.admin_title },
	beforeLoad: async ({ location }) => {
		const { data, error } = await authClient.getSession();
		if (error)
			throw new Error(
				`Session check failed: ${error.status} ${error.statusText}`,
			);
		if (!data)
			throw redirect({
				to: "/admin/login",
				search: { redirect: location.href },
			});
		if (
			isStaff(data.user) &&
			!isAdmin(data.user) &&
			(location.pathname === "/admin" || location.pathname === "/admin/")
		)
			throw redirect({ to: "/admin/orders" });
		return { user: data.user };
	},
	loader: ({ context }) => context.queryClient.ensureQueryData(storeQuery),
	head: () => ({
		meta: [{ title: m.admin_title() }],
	}),
	component: AdminLayout,
});

function AdminLayout() {
	useAdminTheme();
	const { data: store } = useSuspenseQuery(storeQuery);
	const { user } = Route.useRouteContext();
	const router = useRouter();
	const queryClient = useQueryClient();

	const signOut = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.signOut();
			if (error)
				throw new Error(`Sign-out failed: ${error.status} ${error.statusText}`);
		},
		onSuccess: async () => {
			queryClient.removeQueries({ queryKey: ["admin"] });
			await router.navigate({ to: "/admin/login" });
		},
		onError: (error) => toast.error(errorMessage(error)),
	});
	const signOutError = signOut.isError ? errorMessage(signOut.error) : null;

	if (!isStaff(user))
		return (
			<main className="grid gap-4 p-admin-page">
				<p>{m.admin_no_access()}</p>
				<Button
					variant="outline"
					className="w-fit"
					disabled={signOut.isPending}
					onClick={() => signOut.mutate()}
				>
					{m.admin_sign_out()}
				</Button>
				{signOutError && <FieldError>{signOutError}</FieldError>}
			</main>
		);
	return (
		<>
			<StaffAccessProvider user={user}>
				<AdminShell
					storeName={store.name}
					user={user}
					signOut={{ pending: signOut.isPending, run: () => signOut.mutate() }}
				>
					<Outlet />
				</AdminShell>
			</StaffAccessProvider>
			<Toaster theme="dark" />
		</>
	);
}
