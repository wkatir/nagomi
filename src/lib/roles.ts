// Shared by the server and the browser bundle; keep it free of server-only imports.
export const CUSTOMER_ROLE = "customer";
export const SUPPORT_ROLE = "support";
export const ADMIN_ROLE = "admin";
export const USER_ROLES = [CUSTOMER_ROLE, SUPPORT_ROLE, ADMIN_ROLE] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const STAFF_ROLES = [SUPPORT_ROLE, ADMIN_ROLE] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

type RoleHolder = { role?: string | null; banned?: boolean | null };

// Better Auth stores a user's roles as one comma-separated string.
const rolesOf = (user: RoleHolder) =>
	user.banned ? [] : (user.role ?? "").split(",");

export const isAdmin = (user: RoleHolder) => rolesOf(user).includes(ADMIN_ROLE);

export const isStaff = (user: RoleHolder) =>
	rolesOf(user).some((r) => (STAFF_ROLES as readonly string[]).includes(r));

export const STAFF_AREAS = [
	"dashboard",
	"catalog",
	"merchandising",
	"orders",
	"customers",
	"shipping",
	"inventory",
	"purchasing",
	"reports",
	"audit",
	"settings",
	"search",
] as const;
export type StaffArea = (typeof STAFF_AREAS)[number];
export type Access = "none" | "read" | "write";

const SUPPORT_ACCESS: Record<StaffArea, Access> = {
	dashboard: "none",
	catalog: "read",
	merchandising: "none",
	orders: "write",
	customers: "write",
	shipping: "read",
	inventory: "none",
	purchasing: "none",
	reports: "none",
	audit: "none",
	settings: "none",
	search: "read",
};

export const accessTo = (user: RoleHolder, area: StaffArea): Access => {
	if (isAdmin(user)) return "write";
	if (isStaff(user)) return SUPPORT_ACCESS[area];
	return "none";
};

export const canRead = (user: RoleHolder, area: StaffArea) =>
	accessTo(user, area) !== "none";

export const canWrite = (user: RoleHolder, area: StaffArea) =>
	accessTo(user, area) === "write";
