import { Link, useRouterState } from "@tanstack/react-router";
import { LogoMark, Wordmark } from "#/components/brand/wordmark";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "#/components/ui/sidebar";
import { isNavActive, visibleNavGroups } from "./nav";
import { NavUser } from "./nav-user";
import { useStaffAccess } from "./staff-access";

export function AppSidebar({
	storeName,
	user,
	signOut,
}: {
	storeName: string;
	user: { name: string; email: string };
	signOut: { pending: boolean; run: () => void };
}) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const access = useStaffAccess();
	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild>
							<Link to="/admin" aria-label={storeName}>
								<Wordmark
									label={storeName}
									className="text-[22px] text-primary group-data-[collapsible=icon]:hidden"
								/>
								<LogoMark
									label={storeName}
									className="hidden size-6! text-primary group-data-[collapsible=icon]:block"
								/>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				{visibleNavGroups(access.canRead).map((group) => (
					<SidebarGroup key={group.items[0].to}>
						{group.label && (
							<SidebarGroupLabel>{group.label()}</SidebarGroupLabel>
						)}
						<SidebarGroupContent>
							<SidebarMenu>
								{group.items.map((item) => (
									<SidebarMenuItem key={item.to}>
										<SidebarMenuButton
											asChild
											tooltip={item.label()}
											isActive={isNavActive(item.to, pathname)}
										>
											<Link to={item.to}>
												<item.icon aria-hidden />
												<span>{item.label()}</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}
			</SidebarContent>
			<SidebarFooter>
				<NavUser user={user} signOut={signOut} />
			</SidebarFooter>
		</Sidebar>
	);
}
