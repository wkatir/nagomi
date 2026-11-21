// Shared by the server and the browser bundle; keep it free of server-only imports.
export const ADMIN_ROLE = "admin";

// Better Auth stores a user's roles as one comma-separated string.
export const isAdmin = (user: {
	role?: string | null;
	banned?: boolean | null;
}) => !user.banned && (user.role ?? "").split(",").includes(ADMIN_ROLE);
