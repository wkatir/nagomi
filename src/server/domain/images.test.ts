import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Hex } from "./hash";
import { mediaKey, mediaKeyType, readImageInfo } from "./images";

// 40 x 30 pixel files written by ImageMagick and ffmpeg (libaom).
const samples = {
	png: "iVBORw0KGgoAAAANSUhEUgAAACgAAAAeAQMAAABkE86eAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURf8AAP///0EdNBEAAAABYktHRAH/Ai3eAAAAB3RJTUUH6goGAAgQwb5PVQAAAAxJREFUCNdjYBh6AAAAtAABXnGQvwAAAABJRU5ErkJggg==",
	jpeg: "/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAeACgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAYI/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AnQCOaRAAAAAAAAAAf//Z",
	webpLossy:
		"UklGRk4AAABXRUJQVlA4IEIAAABQAwCdASooAB4APpFGnkslo6KhpWgAsBIJZwDO3oAAK/fDcAD+7qY//2LOWwLx//7nA/7nA/7nA/jbB+29aoAAAAA=",
	webpLossless: "UklGRhwAAABXRUJQVlA4TA8AAAAvJ0AHAAcQ/Y/+ByKi/wEA",
	webpExtended:
		"UklGRnIAAABXRUJQVlA4WAoAAAAQAAAAJwAAHQAAQUxQSAoAAAABB9C/iAhERP8DVlA4IEIAAABQAwCdASooAB4APpFGnkslo6KhpWgAsBIJZwDO3oAAK/fDcAD+7qY//2LOWwLx//7nA/7nA/7nA/jbB+29aoAAAAA=",
	avif: "AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAAD5bWV0YQAAAAAAAAAvaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAFBpY3R1cmVIYW5kbGVyAAAAAA5waXRtAAAAAAABAAAAHmlsb2MAAAAARAAAAQABAAAAAQAAASEAAAAdAAAAKGlpbmYAAAAAAAEAAAAaaW5mZQIAAAAAAQAAYXYwMUNvbG9yAAAAAGppcHJwAAAAS2lwY28AAAAUaXNwZQAAAAAAAAAoAAAAHgAAABBwaXhpAAAAAAMICAgAAAAMYXYxQ4EADAAAAAATY29scm5jbHgAAgACAAIAAAAAF2lwbWEAAAAAAAAAAQABBAECgwQAAAAlbWRhdAoGGBUn62AQMhMYAAAAUAAAAAs8/LtEAS+2ZrSg",
};
const bytes = (base64: string) =>
	Uint8Array.from(Buffer.from(base64, "base64"));

describe("readImageInfo", () => {
	test("reads type and size from the header of each accepted format", () => {
		expect(readImageInfo(bytes(samples.png))).toEqual({
			contentType: "image/png",
			width: 40,
			height: 30,
		});
		expect(readImageInfo(bytes(samples.jpeg))).toEqual({
			contentType: "image/jpeg",
			width: 40,
			height: 30,
		});
		for (const webp of [
			samples.webpLossy,
			samples.webpLossless,
			samples.webpExtended,
		])
			expect(readImageInfo(bytes(webp))).toEqual({
				contentType: "image/webp",
				width: 40,
				height: 30,
			});
		expect(readImageInfo(bytes(samples.avif))).toEqual({
			contentType: "image/avif",
			width: 40,
			height: 30,
		});
	});

	test("swaps width and height of a JPEG whose EXIF orientation turns it", () => {
		const exif = [
			...[0xff, 0xd8],
			...[0xff, 0xe1, 0x00, 0x22],
			...Buffer.from("Exif\0\0MM\0*\0\0\0\x08", "latin1"),
			...[0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01],
			...[0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
			...[0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x1e, 0x00, 0x28, 0x01],
			...[0x01, 0x11, 0x00],
			...[0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00],
		];
		expect(readImageInfo(Uint8Array.from(exif))).toEqual({
			contentType: "image/jpeg",
			width: 30,
			height: 40,
		});
	});

	test("refuses incomplete files", () => {
		const png = bytes(samples.png);
		// Without IEND, or with a chunk running past the end.
		expect(readImageInfo(png.subarray(0, png.length - 12))).toBeNull();
		expect(readImageInfo(png.subarray(0, png.length - 1))).toBeNull();
		// A JPEG that stops before its scan.
		const jpeg = bytes(samples.jpeg);
		const sos = jpeg.findIndex((v, i) => v === 0xff && jpeg[i + 1] === 0xda);
		expect(readImageInfo(jpeg.subarray(0, sos))).toBeNull();
		// A WebP whose RIFF claims more than the file has.
		expect(readImageInfo(bytes(samples.webpLossy).subarray(0, 40))).toBeNull();
		// An AVIF without its media data.
		const avif = bytes(samples.avif);
		expect(readImageInfo(avif.subarray(0, avif.length - 37))).toBeNull();
	});

	test("refuses a crafted AVIF with a huge or invalid ftyp box", () => {
		const header = Buffer.from("\xff\xff\xff\xffftypavif", "latin1");
		const crafted = new Uint8Array(header.length + 1024 * 1024);
		crafted.set(header);
		expect(readImageInfo(crafted)).toBeNull();
		const tiny = Uint8Array.from(Buffer.from("\0\0\0\x0cftypavif", "latin1"));
		expect(readImageInfo(tiny)).toBeNull();
	});

	test("refuses pictures over 10,000 px on a side", () => {
		const png = bytes(samples.png);
		const wide = Uint8Array.from(png);
		new DataView(wide.buffer).setUint32(16, 10_001);
		expect(readImageInfo(wide)).toBeNull();
		new DataView(wide.buffer).setUint32(16, 10_000);
		expect(readImageInfo(wide)?.width).toBe(10_000);
	});

	test("refuses other files and truncated headers", () => {
		expect(readImageInfo(new TextEncoder().encode("GIF89a......"))).toBeNull();
		expect(readImageInfo(new TextEncoder().encode("<svg></svg>"))).toBeNull();
		expect(readImageInfo(bytes(samples.png).subarray(0, 12))).toBeNull();
		expect(readImageInfo(bytes(samples.jpeg).subarray(0, 40))).toBeNull();
		expect(readImageInfo(new Uint8Array())).toBeNull();
	});

	test("reads every seed photo", () => {
		const dir = join(import.meta.dir, "../../../seed/images");
		const files = readdirSync(dir);
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const info = readImageInfo(readFileSync(join(dir, file)));
			expect(info?.contentType).toBe("image/webp");
			expect(info?.width).toBeGreaterThan(0);
		}
	});
});

describe("media keys", () => {
	test("are the SHA-256 of the content with the type's extension", async () => {
		const hash = await sha256Hex(new TextEncoder().encode("abc"));
		expect(hash).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
		const key = mediaKey(hash, "image/webp");
		expect(key).toBe(`${hash}.webp`);
		expect(mediaKeyType(key)).toBe("image/webp");
		expect(mediaKeyType(`${hash}.jpg`)).toBe("image/jpeg");
	});

	test("anything else is not a media key", () => {
		for (const key of [
			"../secret",
			`${"a".repeat(64)}.gif`,
			`${"A".repeat(64)}.png`,
			`${"a".repeat(63)}.png`,
			`x/${"a".repeat(64)}.png`,
		])
			expect(mediaKeyType(key)).toBeNull();
	});
});
