import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { getDb, schema } from "#/db";
import { auth } from "#/lib/auth";
import { CUSTOMER_ROLE } from "#/lib/roles";

const { customers } = schema;

// The signed-in customer, or null for a guest (or a staff session, which never shops).
export async function sessionCustomer(c: Context) {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session || session.user.banned || session.user.role !== CUSTOMER_ROLE)
		return null;
	const customer = await getDb().query.customers.findFirst({
		columns: { id: true, name: true, email: true, phoneE164: true },
		where: eq(customers.authUserId, session.user.id),
	});
	return customer ?? null;
}
