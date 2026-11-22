import { createContext, type ReactNode, use } from "react";
import { canRead, canWrite, isAdmin, type StaffArea } from "#/lib/roles";

type StaffUser = { role?: string | null; banned?: boolean | null };

const StaffUserContext = createContext<StaffUser | null>(null);

export function StaffAccessProvider({
	user,
	children,
}: {
	user: StaffUser;
	children: ReactNode;
}) {
	return <StaffUserContext value={user}>{children}</StaffUserContext>;
}

export function useStaffAccess() {
	const user = use(StaffUserContext);
	if (!user) throw new Error("useStaffAccess needs a StaffAccessProvider");
	return {
		user,
		isAdmin: isAdmin(user),
		canRead: (area: StaffArea) => canRead(user, area),
		canWrite: (area: StaffArea) => canWrite(user, area),
	};
}

export function WritableFor({
	area,
	children,
}: {
	area: StaffArea;
	children: ReactNode;
}) {
	const access = useStaffAccess();
	return (
		<fieldset disabled={!access.canWrite(area)} className="contents">
			{children}
		</fieldset>
	);
}

export function IfWritable({
	area,
	children,
}: {
	area: StaffArea;
	children: ReactNode;
}) {
	return useStaffAccess().canWrite(area) ? children : null;
}
