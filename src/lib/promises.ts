// Store promise text can quote the return window, so it never disagrees with the setting.
export const RETURN_WINDOW_PLACEHOLDER = "{return_window_days}";

export const usesReturnWindow = (
	texts: { title: string; body: string | null }[],
) =>
	texts.some((t) =>
		[t.title, t.body].some((x) => x?.includes(RETURN_WINDOW_PLACEHOLDER)),
	);

export function fillPromise(text: string, returnWindowDays: number | null) {
	if (!text.includes(RETURN_WINDOW_PLACEHOLDER)) return text;
	if (returnWindowDays === null)
		throw new Error(
			`A published promise uses ${RETURN_WINDOW_PLACEHOLDER} but return_window_days is not set`,
		);
	return text.replaceAll(RETURN_WINDOW_PLACEHOLDER, String(returnWindowDays));
}
