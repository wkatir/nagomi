import { redirect } from "@tanstack/react-router";
import { canRead, type StaffArea } from "#/lib/roles";

type StaffUser = { role?: string | null; banned?: boolean | null };

export const requireStaffArea =
	(area: StaffArea) =>
	({ context }: { context: { user: StaffUser } }) => {
		if (!canRead(context.user, area)) throw redirect({ to: "/admin/orders" });
	};
