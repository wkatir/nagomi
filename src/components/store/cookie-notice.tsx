import { useEffect, useState } from "react";
import { StoreButton } from "#/components/store/ui/store-button";
import { TextLink } from "#/components/store/ui/text-link";
import { m } from "#/paraglide/messages";

const KEY = "nagomi:cookie-notice:v1";

// Only language and cart are kept in the browser, so the notice asks for no consent;
// measurement or ad tags would need an opt-in first. Opened after hydration so the server
// and the first browser render agree.
export function CookieNotice() {
	const [open, setOpen] = useState(false);
	useEffect(() => {
		try {
			setOpen(localStorage.getItem(KEY) === null);
		} catch {
			// Storage blocked: show it; the dismissal cannot be remembered.
			setOpen(true);
		}
	}, []);
	if (!open) return null;
	const dismiss = () => {
		setOpen(false);
		try {
			localStorage.setItem(KEY, "1");
		} catch {
			// Storage blocked: the notice comes back on the next visit.
		}
	};
	return (
		<section
			aria-label={m.cookies_label()}
			className="panel fixed inset-x-4 bottom-4 z-40 p-5 shadow-lg max-md:[:root:has([data-buy-bar])_&]:bottom-24 md:right-auto md:bottom-6 md:left-6 md:max-w-[420px]"
		>
			<p className="type-small text-foreground-secondary">
				{m.cookies_notice()}{" "}
				<TextLink inline to="/pages/$slug" params={{ slug: "privacy" }}>
					{m.cookies_more()}
				</TextLink>
			</p>
			<StoreButton onClick={dismiss} className="mt-4">
				{m.cookies_ok()}
			</StoreButton>
		</section>
	);
}
