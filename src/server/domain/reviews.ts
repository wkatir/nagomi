import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import { type Rating, ratingOf } from "./catalog-query";

const { customers, productReviews } = schema;

// "María José Hernández" -> "María José H.": reviews never show a full name.
export function reviewerName(name: string | null) {
	const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return null;
	if (words.length === 1) return words[0];
	const last = words[words.length - 1];
	const first = words.length > 2 ? words.slice(0, 2) : words.slice(0, 1);
	return `${first.join(" ")} ${last[0]}.`;
}

export async function approvedReviews(db: Db, productId: number, limit = 50) {
	const [rows, [totals], spread] = await db.batch([
		db
			.select({
				id: productReviews.id,
				rating: productReviews.rating,
				title: productReviews.title,
				body: productReviews.body,
				createdAt: productReviews.createdAt,
				author: customers.name,
			})
			.from(productReviews)
			.innerJoin(customers, eq(customers.id, productReviews.customerId))
			.where(
				and(
					eq(productReviews.productId, productId),
					eq(productReviews.status, "approved"),
				),
			)
			.orderBy(desc(productReviews.createdAt), desc(productReviews.id))
			.limit(limit),
		db
			.select({
				reviews: sql<number>`count(*)`.as("review_count"),
				ratingSum: sql<number>`coalesce(sum(${productReviews.rating}), 0)`.as(
					"rating_sum",
				),
			})
			.from(productReviews)
			.where(
				and(
					eq(productReviews.productId, productId),
					eq(productReviews.status, "approved"),
				),
			),
		db
			.select({
				stars: productReviews.rating,
				reviews: sql<number>`count(*)`.as("stars_count"),
			})
			.from(productReviews)
			.where(
				and(
					eq(productReviews.productId, productId),
					eq(productReviews.status, "approved"),
				),
			)
			.groupBy(productReviews.rating),
	]);
	const rating: Rating = ratingOf(totals?.ratingSum ?? 0, totals?.reviews ?? 0);
	return {
		...rating,
		distribution: [5, 4, 3, 2, 1].map((stars) => ({
			stars,
			count: spread.find((s) => s.stars === stars)?.reviews ?? 0,
		})),
		reviews: rows.map(({ author, ...r }) => ({
			...r,
			author: reviewerName(author),
		})),
	};
}
