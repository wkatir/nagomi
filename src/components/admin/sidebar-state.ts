// The generated SidebarProvider writes this cookie whenever the sidebar is opened or collapsed.
const COOKIE = "sidebar_state";

export const sidebarOpenFrom = (cookie: string) =>
	!cookie.split("; ").includes(`${COOKIE}=false`);
