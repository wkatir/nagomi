import { useEffect } from "react";
import "./admin-theme.css";

const THEME_CLASSES = ["admin-theme", "dark"];

export function useAdminTheme() {
	useEffect(() => {
		document.body.classList.add(...THEME_CLASSES);
		return () => document.body.classList.remove(...THEME_CLASSES);
	}, []);
}
