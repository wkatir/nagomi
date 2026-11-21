import { Link } from "@tanstack/react-router";
import { ChevronsUpDown, LogOut, Store } from "lucide-react";
import { languageName } from "#/components/admin/labels";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "#/components/ui/sidebar";
import { useLocaleHref } from "#/hooks/use-locale-href";
import { LOCALES } from "#/lib/enums";
import { initialsOf } from "#/lib/initials";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

type User = { name: string; email: string };

function UserIdentity({ user }: { user: User }) {
	return (
		<>
			<Avatar className="size-8 rounded-sm">
				<AvatarFallback className="rounded-sm font-bold">
					{initialsOf(user.name)}
				</AvatarFallback>
			</Avatar>
			<div className="grid flex-1 text-left leading-tight">
				<span className="truncate font-medium">{user.name}</span>
				<span className="truncate type-meta text-muted-foreground">
					{user.email}
				</span>
			</div>
		</>
	);
}

export function NavUser({
	user,
	signOut,
}: {
	user: User;
	signOut: { pending: boolean; run: () => void };
}) {
	const { isMobile } = useSidebar();
	const localeHref = useLocaleHref();
	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						>
							<UserIdentity user={user} />
							<ChevronsUpDown aria-hidden className="ml-auto size-4" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
						side={isMobile ? "bottom" : "right"}
						align="end"
						sideOffset={4}
					>
						<DropdownMenuLabel className="flex items-center gap-2 p-1.5 font-normal">
							<UserIdentity user={user} />
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuLabel className="type-meta text-muted-foreground">
								{m.admin_user_language()}
							</DropdownMenuLabel>
							<DropdownMenuRadioGroup value={getLocale()}>
								{LOCALES.map((locale) => (
									<DropdownMenuRadioItem
										key={locale}
										value={locale}
										onSelect={() => window.location.assign(localeHref(locale))}
									>
										{languageName[locale]()}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem asChild>
							<Link to="/">
								<Store aria-hidden />
								{m.admin_user_view_store()}
							</Link>
						</DropdownMenuItem>
						<DropdownMenuItem disabled={signOut.pending} onSelect={signOut.run}>
							<LogOut aria-hidden />
							{m.admin_sign_out()}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
