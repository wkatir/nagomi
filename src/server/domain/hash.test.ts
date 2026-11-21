import { expect, test } from "bun:test";
import { sha256Hex } from "./hash";

test("is the lowercase hex SHA-256 of the bytes", async () => {
	expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
		"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
	);
});
