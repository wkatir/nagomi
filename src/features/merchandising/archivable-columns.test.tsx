import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import type { CategoryRow } from "#/features/categories/queries";
import { archivableColumns } from "./archivable-columns";
import type { RowActions } from "./row-actions";

const row = (status: CategoryRow["status"]): CategoryRow => ({
	id: 4,
	slug: "serum",
	name: "Sérum",
	routineStep: 1,
	status,
	products: 0,
});

function offered(status: CategoryRow["status"]) {
	const calls: unknown[][] = [];
	const { actions } = archivableColumns<CategoryRow>({
		onEdit: (id) => calls.push(["edit", id]),
		onStatus: (id, next) => calls.push(["status", id, next]),
	});
	const cell = actions.cell as (context: {
		row: { original: CategoryRow };
	}) => ReactElement<Parameters<typeof RowActions>[0]>;
	const { props } = cell({ row: { original: row(status) } });
	return { props, calls };
}

describe("the actions of a row", () => {
	test("an active one can be edited and archived, not restored", () => {
		const { props, calls } = offered("active");
		expect(props.name).toBe("Sérum");
		expect(props.onRestore).toBeUndefined();
		props.onEdit?.();
		props.onArchive?.();
		expect(calls).toEqual([
			["edit", 4],
			["status", 4, "archived"],
		]);
	});

	test("an archived one can be edited and restored, not archived", () => {
		const { props, calls } = offered("archived");
		expect(props.onArchive).toBeUndefined();
		props.onEdit?.();
		props.onRestore?.();
		expect(calls).toEqual([
			["edit", 4],
			["status", 4, "active"],
		]);
	});
});

describe("the sortable columns", () => {
	test("have the ids of the sorts the API accepts, and the rest cannot be sorted", () => {
		const { name, slug, products, status, actions } =
			archivableColumns<CategoryRow>({ onEdit: () => {}, onStatus: () => {} });
		expect([name.id, products.id, status.id]).toEqual([
			"name",
			"products",
			"status",
		]);
		expect(slug.enableSorting).toBe(false);
		expect(actions.id).toBe("actions");
	});
});
