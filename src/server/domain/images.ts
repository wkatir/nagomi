import type { ImageType } from "#/db/schema";

// Photos are resized before upload (a 1600 px WebP packshot is well under 1 MB); hashing
// this much stays within a few ms of CPU.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EXTENSIONS: Record<ImageType, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/avif": "avif",
};
const TYPE_BY_EXTENSION = Object.fromEntries(
	Object.entries(EXTENSIONS).map(([type, ext]) => [ext, type as ImageType]),
);

export type ImageInfo = {
	contentType: ImageType;
	width: number;
	height: number;
};

const MAX_IMAGE_DIMENSION = 10_000;

// Only header names, signatures and brand lists are read as text, so 64 bytes is enough.
const ascii = (b: Uint8Array, at: number, length: number) =>
	String.fromCharCode(...b.subarray(at, at + Math.min(length, 64)));
const u16be = (b: Uint8Array, at: number) =>
	((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
const u32be = (b: Uint8Array, at: number) =>
	u16be(b, at) * 65536 + u16be(b, at + 2);
const u16le = (b: Uint8Array, at: number) =>
	(b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, at: number) =>
	u16le(b, at) | ((b[at + 2] ?? 0) << 16);
const u32le = (b: Uint8Array, at: number) =>
	u16le(b, at) + u16le(b, at + 2) * 65536;

function png(b: Uint8Array): ImageInfo | null {
	if (u32be(b, 8) !== 13 || ascii(b, 12, 4) !== "IHDR") return null;
	const info: ImageInfo = {
		contentType: "image/png",
		width: u32be(b, 16),
		height: u32be(b, 20),
	};
	let data = false;
	for (let at = 8; at + 12 <= b.length; ) {
		const length = u32be(b, at);
		const type = ascii(b, at + 4, 4);
		if (at + 12 + length > b.length) return null;
		if (type === "IDAT") data = true;
		if (type === "IEND") return data ? info : null;
		at += 12 + length;
	}
	return null;
}

function webp(b: Uint8Array): ImageInfo | null {
	const end = 8 + u32le(b, 4);
	if (end > b.length || end < 20) return null;
	const chunks: { type: string; at: number; size: number }[] = [];
	for (let at = 12; at + 8 <= end; ) {
		const size = u32le(b, at + 4);
		if (at + 8 + size > end) return null;
		chunks.push({ type: ascii(b, at, 4), at, size });
		at += 8 + size + (size % 2);
	}
	const [first] = chunks;
	const info = (width: number, height: number): ImageInfo => ({
		contentType: "image/webp",
		width,
		height,
	});
	const image = chunks.find((c) => c.type === "VP8 " || c.type === "VP8L");
	if (!first || !image) return null;
	if (first.type === "VP8X")
		return first.size >= 10
			? info(u24le(b, first.at + 12) + 1, u24le(b, first.at + 15) + 1)
			: null;
	const at = first.at + 8;
	if (
		first.type === "VP8 " &&
		first.size >= 10 &&
		b[at + 3] === 0x9d &&
		b[at + 4] === 0x01 &&
		b[at + 5] === 0x2a
	)
		return info(u16le(b, at + 6) & 0x3fff, u16le(b, at + 8) & 0x3fff);
	if (first.type === "VP8L" && first.size >= 5 && b[at] === 0x2f) {
		const bits = u32le(b, at + 1);
		return info((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
	}
	return null;
}

// EXIF orientations 5 to 8 rotate a quarter turn: browsers show width and height swapped.
function exifRotated(b: Uint8Array, at: number, end: number) {
	if (ascii(b, at, 6) !== "Exif\0\0") return false;
	const tiff = at + 6;
	const little = ascii(b, tiff, 2) === "II";
	const u16 = (p: number) => (little ? u16le(b, p) : u16be(b, p));
	const u32 = (p: number) => (little ? u32le(b, p) : u32be(b, p));
	const ifd = tiff + u32(tiff + 4);
	const entries = u16(ifd);
	for (let i = 0; i < entries; i++) {
		const entry = ifd + 2 + i * 12;
		if (entry + 12 > end) return false;
		if (u16(entry) === 0x0112) return u16(entry + 8) >= 5;
	}
	return false;
}

function jpeg(b: Uint8Array): ImageInfo | null {
	let at = 2;
	let rotated = false;
	let info: ImageInfo | null = null;
	while (at + 4 <= b.length) {
		if (b[at] !== 0xff) return null;
		const marker = b[at + 1] ?? 0;
		if (marker === 0xff) {
			at++;
			continue;
		}
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			at += 2;
			continue;
		}
		const length = u16be(b, at + 2);
		if (length < 2 || at + 2 + length > b.length) return null;
		if (marker === 0xda) return info;
		if (marker === 0xe1) rotated ||= exifRotated(b, at + 4, at + 2 + length);
		const isFrame =
			marker >= 0xc0 &&
			marker <= 0xcf &&
			marker !== 0xc4 &&
			marker !== 0xc8 &&
			marker !== 0xcc;
		if (isFrame && !info && length >= 8) {
			const height = u16be(b, at + 5);
			const width = u16be(b, at + 7);
			info = {
				contentType: "image/jpeg",
				width: rotated ? height : width,
				height: rotated ? width : height,
			};
		}
		at += 2 + length;
	}
	return null;
}

function isoBoxes(b: Uint8Array) {
	const boxes: { type: string; at: number; size: number; header: number }[] =
		[];
	for (let at = 0; at + 8 <= b.length; ) {
		let size = u32be(b, at);
		let header = 8;
		if (size === 1) {
			size = u32be(b, at + 8) * 2 ** 32 + u32be(b, at + 12);
			header = 16;
		} else if (size === 0) size = b.length - at;
		if (size < header || at + size > b.length) return null;
		boxes.push({ type: ascii(b, at + 4, 4), at, size, header });
		at += size;
	}
	return boxes;
}

// The largest 'ispe' in 'meta' is the picture: a grid image also lists its tiles.
function avif(b: Uint8Array): ImageInfo | null {
	const boxes = isoBoxes(b);
	const [ftyp] = boxes ?? [];
	if (!boxes || ftyp?.type !== "ftyp" || ftyp.size < 16) return null;
	const brands = ascii(b, 8, Math.min(ftyp.size, 64) - 8);
	if (!/avi[fs]/.test(brands)) return null;
	const meta = boxes.find((x) => x.type === "meta");
	if (!meta || !boxes.some((x) => x.type === "mdat")) return null;
	let width = 0;
	let height = 0;
	let rotated = false;
	const end = Math.min(meta.at + meta.size, meta.at + 64 * 1024);
	for (let at = meta.at + meta.header; at + 16 <= end; at++) {
		const box = ascii(b, at, 4);
		if (box === "ispe") {
			const w = u32be(b, at + 8);
			const h = u32be(b, at + 12);
			if (w * h > width * height) {
				width = w;
				height = h;
			}
		} else if (box === "irot") rotated ||= ((b[at + 4] ?? 0) & 1) === 1;
	}
	if (!width || !height) return null;
	return {
		contentType: "image/avif",
		width: rotated ? height : width,
		height: rotated ? width : height,
	};
}

// From the file's own bytes, never its name or declared type.
export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
	let info: ImageInfo | null = null;
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
		info = jpeg(bytes);
	else if (ascii(bytes, 0, 8) === "\x89PNG\r\n\x1a\n") info = png(bytes);
	else if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP")
		info = webp(bytes);
	else if (ascii(bytes, 4, 4) === "ftyp") info = avif(bytes);
	if (!info) return null;
	const fits = (n: number) => n >= 1 && n <= MAX_IMAGE_DIMENSION;
	return fits(info.width) && fits(info.height) ? info : null;
}

export const mediaKey = (sha256: string, type: ImageType) =>
	`${sha256}.${EXTENSIONS[type]}`;

const KEY = /^[0-9a-f]{64}\.(jpg|png|webp|avif)$/;

export function mediaKeyType(key: string): ImageType | null {
	const ext = KEY.exec(key)?.[1];
	if (ext === undefined) return null;
	const type = TYPE_BY_EXTENSION[ext];
	if (type === undefined)
		throw new Error(`Media key extension ${ext} has no image type`);
	return type;
}

export const mediaUrl = (key: string) => `/media/${key}`;
