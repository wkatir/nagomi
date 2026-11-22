import {
	BadgePercent,
	Bell,
	Boxes,
	ChartColumn,
	ClipboardList,
	GalleryHorizontalEnd,
	Images,
	Layers,
	LayoutDashboard,
	LayoutGrid,
	ListOrdered,
	type LucideIcon,
	Package,
	ScrollText,
	Settings,
	ShoppingCart,
	Star,
	Tag,
	TimerReset,
	Truck,
	Users,
} from "lucide-react";
import type { StaffArea } from "#/lib/roles";
import { m } from "#/paraglide/messages";
import type { FileRouteTypes } from "#/routeTree.gen";

type StaticAdminRoute = Exclude<
	Extract<FileRouteTypes["to"], `/admin${string}`>,
	`${string}$${string}`
>;

type NavItem = {
	to: StaticAdminRoute;
	label: () => string;
	icon: LucideIcon;
	area: StaffArea;
};
type NavGroup = { label?: () => string; items: NavItem[] };

export const navGroups: NavGroup[] = [
	{
		items: [
			{
				to: "/admin",
				area: "dashboard",
				label: m.admin_nav_overview,
				icon: LayoutDashboard,
			},
		],
	},
	{
		label: m.admin_nav_group_sales,
		items: [
			{
				to: "/admin/orders",
				area: "orders",
				label: m.admin_nav_orders,
				icon: ShoppingCart,
			},
			{
				to: "/admin/orders/followups",
				area: "orders",
				label: m.admin_nav_followups,
				icon: TimerReset,
			},
			{
				to: "/admin/customers",
				area: "customers",
				label: m.admin_nav_customers,
				icon: Users,
			},
			{
				to: "/admin/reviews",
				area: "customers",
				label: m.admin_nav_reviews,
				icon: Star,
			},
			{
				to: "/admin/promotions",
				area: "merchandising",
				label: m.admin_nav_promotions,
				icon: BadgePercent,
			},
			{
				to: "/admin/shipping",
				area: "shipping",
				label: m.admin_nav_shipping,
				icon: Truck,
			},
		],
	},
	{
		label: m.admin_nav_group_catalog,
		items: [
			{
				to: "/admin/products",
				area: "catalog",
				label: m.admin_nav_products,
				icon: Package,
			},
			{
				to: "/admin/brands",
				area: "catalog",
				label: m.admin_nav_brands,
				icon: Tag,
			},
			{
				to: "/admin/categories",
				area: "catalog",
				label: m.admin_nav_categories,
				icon: LayoutGrid,
			},
			{
				to: "/admin/bundles",
				area: "catalog",
				label: m.admin_nav_routines,
				icon: ListOrdered,
			},
			{
				to: "/admin/collections",
				area: "merchandising",
				label: m.admin_nav_collections,
				icon: Layers,
			},
		],
	},
	{
		label: m.admin_nav_group_supply,
		items: [
			{
				to: "/admin/inventory",
				area: "inventory",
				label: m.admin_nav_inventory,
				icon: Boxes,
			},
			{
				to: "/admin/stock-alerts",
				area: "inventory",
				label: m.admin_nav_stock_alerts,
				icon: Bell,
			},
			{
				to: "/admin/purchases",
				area: "purchasing",
				label: m.admin_nav_purchases,
				icon: ClipboardList,
			},
			{
				to: "/admin/suppliers",
				area: "purchasing",
				label: m.admin_nav_suppliers,
				icon: Truck,
			},
		],
	},
	{
		label: m.admin_nav_group_content,
		items: [
			{
				to: "/admin/slides",
				area: "merchandising",
				label: m.admin_nav_slides,
				icon: GalleryHorizontalEnd,
			},
			{
				to: "/admin/library",
				area: "catalog",
				label: m.admin_nav_library,
				icon: Images,
			},
		],
	},
	{
		label: m.admin_nav_group_analysis,
		items: [
			{
				to: "/admin/reports",
				area: "reports",
				label: m.admin_nav_reports,
				icon: ChartColumn,
			},
			{
				to: "/admin/audit",
				area: "audit",
				label: m.admin_nav_audit,
				icon: ScrollText,
			},
		],
	},
	{
		items: [
			{
				to: "/admin/settings",
				area: "settings",
				label: m.admin_nav_settings,
				icon: Settings,
			},
		],
	},
];

export const visibleNavGroups = (canRead: (area: StaffArea) => boolean) =>
	navGroups
		.map((group) => ({
			...group,
			items: group.items.filter((item) => canRead(item.area)),
		}))
		.filter((group) => group.items.length > 0);

// The overview is current only on its own page, since every other page is under /admin.
export const isNavActive = (to: string, pathname: string) =>
	to === "/admin"
		? pathname === "/admin"
		: pathname === to ||
			(pathname.startsWith(`${to}/`) &&
				!navGroups.some((group) =>
					group.items.some(
						(item) =>
							item.to !== to &&
							item.to.startsWith(`${to}/`) &&
							(pathname === item.to || pathname.startsWith(`${item.to}/`)),
					),
				));
