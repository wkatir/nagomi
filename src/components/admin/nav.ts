import {
	BadgePercent,
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
	Tag,
	Target,
	Truck,
	Users,
} from "lucide-react";
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
};
type NavGroup = { label?: () => string; items: NavItem[] };

export const navGroups: NavGroup[] = [
	{
		items: [
			{ to: "/admin", label: m.admin_nav_overview, icon: LayoutDashboard },
		],
	},
	{
		label: m.admin_nav_group_sales,
		items: [
			{ to: "/admin/orders", label: m.admin_nav_orders, icon: ShoppingCart },
			{ to: "/admin/customers", label: m.admin_nav_customers, icon: Users },
			{
				to: "/admin/promotions",
				label: m.admin_nav_promotions,
				icon: BadgePercent,
			},
			{ to: "/admin/shipping", label: m.admin_nav_shipping, icon: Truck },
		],
	},
	{
		label: m.admin_nav_group_catalog,
		items: [
			{ to: "/admin/products", label: m.admin_nav_products, icon: Package },
			{ to: "/admin/brands", label: m.admin_nav_brands, icon: Tag },
			{
				to: "/admin/categories",
				label: m.admin_nav_categories,
				icon: LayoutGrid,
			},
			{ to: "/admin/concerns", label: m.admin_nav_concerns, icon: Target },
			{
				to: "/admin/routines",
				label: m.admin_nav_routines,
				icon: ListOrdered,
			},
			{
				to: "/admin/collections",
				label: m.admin_nav_collections,
				icon: Layers,
			},
		],
	},
	{
		label: m.admin_nav_group_supply,
		items: [
			{ to: "/admin/inventory", label: m.admin_nav_inventory, icon: Boxes },
			{
				to: "/admin/purchases",
				label: m.admin_nav_purchases,
				icon: ClipboardList,
			},
			{ to: "/admin/suppliers", label: m.admin_nav_suppliers, icon: Truck },
		],
	},
	{
		label: m.admin_nav_group_content,
		items: [
			{
				to: "/admin/slides",
				label: m.admin_nav_slides,
				icon: GalleryHorizontalEnd,
			},
			{ to: "/admin/library", label: m.admin_nav_library, icon: Images },
		],
	},
	{
		label: m.admin_nav_group_analysis,
		items: [
			{ to: "/admin/reports", label: m.admin_nav_reports, icon: ChartColumn },
			{ to: "/admin/audit", label: m.admin_nav_audit, icon: ScrollText },
		],
	},
	{
		items: [
			{ to: "/admin/settings", label: m.admin_nav_settings, icon: Settings },
		],
	},
];

// The overview is current only on its own page, since every other page is under /admin.
export const isNavActive = (to: string, pathname: string) =>
	to === "/admin"
		? pathname === "/admin"
		: pathname === to || pathname.startsWith(`${to}/`);
