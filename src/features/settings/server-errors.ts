import { serverErrors } from "#/components/admin/form/server-errors";
import { apiErrorOf } from "#/lib/api";
import { errorMessage } from "#/lib/errors";

// Rules on a single setting come back as a code, not as a field path.
export function settingsErrors<Field extends string>(
	error: unknown,
	fieldOf: (path: string) => Field | undefined,
	codeFields: Readonly<Record<string, Field>>,
) {
	const code = apiErrorOf(error)?.code;
	const field = code === undefined ? undefined : codeFields[code];
	if (field === undefined) return serverErrors(error, fieldOf);
	const fields: Partial<Record<Field, string>> = {};
	fields[field] = errorMessage(error);
	return { form: undefined, fields };
}
