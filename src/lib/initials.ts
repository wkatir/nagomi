// A user always has a name (the admin script requires one), so a blank one is a bug.
export function initialsOf(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	const first = words[0];
	if (!first) throw new Error("A user has a name");
	const last = words.length > 1 ? words[words.length - 1] : undefined;
	const letter = (word: string) => Array.from(word)[0];
	return (letter(first) + (last ? letter(last) : "")).toLocaleUpperCase();
}
