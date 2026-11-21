import { expect, test } from "bun:test";
import { fillPromise, usesReturnWindow } from "./promises";

test("fills the return window from the setting", () => {
	expect(fillPromise("{return_window_days} días para devolver", 8)).toBe(
		"8 días para devolver",
	);
	expect(fillPromise("Proveedor autorizado", null)).toBe(
		"Proveedor autorizado",
	);
});

test("refuses to show a return window that is not set", () => {
	expect(() => fillPromise("{return_window_days} days", null)).toThrow(
		"return_window_days is not set",
	);
});

test("detects texts that quote the return window", () => {
	expect(
		usesReturnWindow([{ title: "Returns", body: "{return_window_days} days" }]),
	).toBe(true);
	expect(usesReturnWindow([{ title: "Batch", body: null }])).toBe(false);
});
