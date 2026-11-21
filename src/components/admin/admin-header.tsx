import { PanelLeft } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import { useSidebar } from "#/components/ui/sidebar";
import { m } from "#/paraglide/messages";
import { AdminBreadcrumbs } from "./admin-breadcrumbs";
import { CommandSearch } from "./command-search";

// The generated SidebarTrigger carries an English "Toggle Sidebar", so the button is drawn
// here with a Paraglide label.
export function AdminHeader() {
	const { toggleSidebar } = useSidebar();
	return (
		<header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-admin-page max-md:px-4">
			<Button
				variant="ghost"
				size="icon"
				className="-ml-2"
				aria-label={m.nav_menu()}
				onClick={toggleSidebar}
			>
				<PanelLeft aria-hidden />
			</Button>
			<Separator orientation="vertical" className="mr-1 h-4" />
			<AdminBreadcrumbs />
			<CommandSearch />
		</header>
	);
}
