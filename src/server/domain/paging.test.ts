import { expect, test } from "bun:test";
import { pageOf } from "./paging";

const rows = (...ids: number[]) => ids.map((id) => ({ id }));

test("a full page with an extra row points at the last row it returns", () => {
	expect(pageOf(rows(9, 8, 7), 2)).toEqual({
		page: rows(9, 8),
		nextCursor: 8,
	});
});

test("exactly `limit` rows is the last page", () => {
	expect(pageOf(rows(9, 8), 2)).toEqual({ page: rows(9, 8), nextCursor: null });
});

test("fewer rows than the limit, or none, is the last page", () => {
	expect(pageOf(rows(9), 2)).toEqual({ page: rows(9), nextCursor: null });
	expect(pageOf(rows(), 2)).toEqual({ page: [], nextCursor: null });
});
