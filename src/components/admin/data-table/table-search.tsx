import { SearchIcon } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "#/components/ui/input-group";
import { useDebouncedValue } from "#/hooks/use-debounced-value";

const DEBOUNCE_MS = 300;

// When the URL's text changes by itself (filters cleared, browser back) the box follows it.
export function TableSearch({
	value,
	onChange,
	label,
}: {
	value: string | undefined;
	onChange: (value: string | undefined) => void;
	label: string;
}) {
	const [draft, setDraft] = useState(value ?? "");
	const debounced = useDebouncedValue(draft, DEBOUNCE_MS);
	// The last text this box put in the URL, so its own change is not taken for an outside one.
	const sent = useRef(value);

	const send = useEffectEvent((text: string) => {
		const next = text.trim() || undefined;
		if (next === value) return;
		sent.current = next;
		onChange(next);
	});
	useEffect(() => send(debounced), [debounced]);

	useEffect(() => {
		if (value === sent.current) return;
		sent.current = value;
		setDraft(value ?? "");
	}, [value]);

	return (
		<InputGroup className="h-8 w-full sm:w-64">
			<InputGroupAddon>
				<SearchIcon aria-hidden />
			</InputGroupAddon>
			<InputGroupInput
				type="search"
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				placeholder={label}
				aria-label={label}
				maxLength={80}
			/>
		</InputGroup>
	);
}
