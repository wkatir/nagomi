import type * as React from "react";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import { AdminHeader } from "./admin-header";
import { AppSidebar } from "./app-sidebar";
import { sidebarOpenFrom } from "./sidebar-state";

// The back office renders in the browser only, so the cookie that remembers a collapsed
// sidebar can be read right away.
export function AdminShell({
	storeName,
	user,
	signOut,
	children,
}: {
	storeName: string;
	user: { name: string; email: string };
	signOut: { pending: boolean; run: () => void };
	children: React.ReactNode;
}) {
	return (
		<SidebarProvider defaultOpen={sidebarOpenFrom(document.cookie)}>
			<AppSidebar storeName={storeName} user={user} signOut={signOut} />
			<SidebarInset className="min-w-0">
				<AdminHeader />
				<div className="min-w-0 p-admin-page max-md:p-4">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
