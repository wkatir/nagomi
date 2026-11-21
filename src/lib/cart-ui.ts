import { useSyncExternalStore } from "react";

let isOpen = false;
let opener: HTMLElement | null = null;
const listeners = new Set<() => void>();

function set(next: boolean) {
	if (isOpen === next) return;
	isOpen = next;
	for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
	listeners.add(l);
	return () => {
		listeners.delete(l);
	};
};

export const useCartDrawerOpen = () =>
	useSyncExternalStore(
		subscribe,
		() => isOpen,
		() => false,
	);

export const cartDrawer = {
	open(from?: HTMLElement | null) {
		opener = from ?? null;
		set(true);
	},
	close: () => set(false),
	setOpen: set,
	restoreFocus() {
		if (opener?.isConnected) opener.focus();
		opener = null;
	},
};
