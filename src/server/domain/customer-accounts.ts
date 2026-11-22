import { and, eq, isNull } from "drizzle-orm";
import { type Db, schema } from "#/db";
import { searchKey } from "./search";

const { customers } = schema;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function linkCustomerAccount(
	db: Db,
	user: { id: string; email: string; name: string },
) {
	const email = normalizeEmail(user.email);
	const guest = await db.query.customers.findFirst({
		where: and(eq(customers.email, email), isNull(customers.authUserId)),
	});
	if (guest) {
		const name = guest.name ?? user.name;
		await db
			.update(customers)
			.set({
				authUserId: user.id,
				name,
				searchKey: searchKey(name, email, guest.phoneE164),
			})
			.where(eq(customers.id, guest.id));
		return guest.id;
	}
	const [created] = await db
		.insert(customers)
		.values({
			authUserId: user.id,
			name: user.name,
			email,
			searchKey: searchKey(user.name, email),
		})
		.returning({ id: customers.id });
	if (!created) throw new Error(`Could not create the customer of ${user.id}`);
	return created.id;
}
