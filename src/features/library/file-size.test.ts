import { describe, expect, test } from "bun:test";
import { formatFileSize } from "./file-size";

describe("formatFileSize", () => {
	test("writes bytes below a kilobyte", () => {
		expect(formatFileSize(1, "en-SV")).toBe("1 B");
		expect(formatFileSize(1023, "en-SV")).toBe("1,023 B");
	});

	test("writes kilobytes from 1024 bytes", () => {
		expect(formatFileSize(1024, "en-SV")).toBe("1 kB");
		expect(formatFileSize(1536, "en-SV")).toBe("1.5 kB");
		expect(formatFileSize(200 * 1024, "en-SV")).toBe("200 kB");
	});

	test("writes megabytes from 1024 kilobytes", () => {
		expect(formatFileSize(1024 * 1024, "en-SV")).toBe("1 MB");
		expect(formatFileSize(2.5 * 1024 * 1024, "en-SV")).toBe("2.5 MB");
		expect(formatFileSize(5 * 1024 * 1024, "en-SV")).toBe("5 MB");
	});

	test("follows the language of the page", () => {
		expect(formatFileSize(1_572_864, "es-SV")).toBe("1.5 MB");
		expect(formatFileSize(1234, "en-SV")).toBe("1.2 kB");
	});
});
