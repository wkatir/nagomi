import { apiErrorOf } from "#/lib/api";
import { errorMessage } from "#/lib/errors";

export function serverErrors<Field extends string>(
	error: unknown,
	fieldOf: (path: string) => Field | undefined,
) {
	const issues = apiErrorOf(error)?.body.issues;
	const fields: Partial<Record<Field, string>> = {};
	const unplaced: string[] = [];
	if (Array.isArray(issues))
		for (const issue of issues as { path: string; message: string }[]) {
			const field = fieldOf(issue.path);
			if (field) fields[field] = issue.message;
			else unplaced.push(issue.message);
		}
	return {
		form:
			Object.keys(fields).length > 0 && unplaced.length === 0
				? undefined
				: errorMessage(error),
		fields,
	};
}
