import { expect, test } from "bun:test";
import { newOrderCode } from "./order-code";

test("uses the prefix and six characters from the unambiguous alphabet", () => {
	const code = newOrderCode(
		"NAG",
		() => new Uint8Array([0, 1, 30, 31, 62, 255]),
	);
	expect(code).toBe("NAG-23Z229");
	expect(code.slice(4)).not.toMatch(/[01OIL]/);
});
