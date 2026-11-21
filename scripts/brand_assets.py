"""Draws the Eclalune mark, favicons, app icons and Open Graph images from Satoshi outlines.

The mark is a white Satoshi Bold "e" on a #111111 square (Wilmer's logo file,
eclalune-linkedin-logo-400.png: the glyph's box is centred and 47.5% of the side). The
wordmark is "eclalune" in Satoshi Bold with the font's kerning and -0.04em tracking.

Outlines are read from public/fonts (run `bun run fonts` first); no font file is written,
so the outputs are outlined graphics, which the Satoshi license allows. Needs Python 3 with
fonttools, brotli and Pillow. Run from app/: python scripts/brand_assets.py
"""

from io import BytesIO
from pathlib import Path

from fontTools.pens.basePen import BasePen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageChops, ImageDraw

APP = Path(__file__).resolve().parent.parent
PUBLIC = APP / "public"
BRAND_PATHS = APP / "src/components/brand/brand-paths.ts"
WORDMARK_MASTER = APP.parent / "docs/brand/final/eclalune-wordmark.svg"

INK = "#111111"
WHITE = "#ffffff"
TAGLINE_GREY = "#bdbdbd"
GLYPH_SHARE = 0.475  # glyph box height / square side, measured on the original logo
TRACKING = -0.04  # em
SUPERSAMPLE = 8

bold = TTFont(APP / "public/fonts/satoshi-bold.woff2")
medium = TTFont(APP / "public/fonts/satoshi-medium.woff2")


def x_advance(value) -> int:
    return getattr(value, "XAdvance", 0) or 0 if value else 0


def kerning(font: TTFont, first: str, second: str) -> int:
    """X-advance adjustment of a glyph pair in the GPOS kern feature (pair positioning)."""
    gpos = font["GPOS"].table
    indices = sorted(
        {
            i
            for record in gpos.FeatureList.FeatureRecord
            if record.FeatureTag == "kern"
            for i in record.Feature.LookupListIndex
        }
    )
    total = 0
    for index in indices:
        lookup = gpos.LookupList.Lookup[index]
        for sub in lookup.SubTable:
            kind = lookup.LookupType
            if kind == 9:
                kind, sub = sub.ExtensionLookupType, sub.ExtSubTable
            if kind != 2 or first not in sub.Coverage.glyphs:
                continue
            if sub.Format == 1:
                pair_set = sub.PairSet[sub.Coverage.glyphs.index(first)]
                match = [r for r in pair_set.PairValueRecord if r.SecondGlyph == second]
                if not match:
                    continue
                total += x_advance(match[0].Value1)
            else:
                row = sub.Class1Record[sub.ClassDef1.classDefs.get(first, 0)]
                total += x_advance(row.Class2Record[sub.ClassDef2.classDefs.get(second, 0)].Value1)
            break
    return total


def layout(font: TTFont, text: str, tracking: float = 0.0) -> list[tuple[str, float]]:
    """Glyph names with their x offsets in font units (kerning and tracking applied)."""
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    names = [cmap[ord(ch)] for ch in text]
    placed, x = [], 0.0
    for i, name in enumerate(names):
        placed.append((name, x))
        x += font["hmtx"][name][0] + tracking * upm
        if i + 1 < len(names):
            x += kerning(font, name, names[i + 1])
    return placed


def ink_box(font: TTFont, placed: list[tuple[str, float]]) -> tuple[float, float, float, float]:
    glyf = font["glyf"]
    boxes = []
    for name, x in placed:
        g = glyf[name]
        if g.numberOfContours:
            boxes.append((x + g.xMin, g.yMin, x + g.xMax, g.yMax))
    return (
        min(b[0] for b in boxes),
        min(b[1] for b in boxes),
        max(b[2] for b in boxes),
        max(b[3] for b in boxes),
    )


def svg_path(font: TTFont, placed, transform) -> str:
    """Placed glyphs as one SVG path; transform maps font units (y up) to the target space."""
    glyph_set = font.getGlyphSet()
    pen = SVGPathPen(glyph_set, ntos=lambda v: f"{round(v, 1):g}")
    for name, x in placed:
        a, b, c, d, e, f = transform
        glyph_set[name].draw(TransformPen(pen, (a, b, c, d, a * x + e, b * x + f)))
    return pen.getCommands()


class FlattenPen(BasePen):
    """Contours as point lists (curves split into short segments), for rasterizing."""

    def __init__(self, glyph_set, transform):
        super().__init__(glyph_set)
        self.transform = transform
        self.contours: list[list[tuple[float, float]]] = []

    def _map(self, p):
        a, b, c, d, e, f = self.transform
        return (a * p[0] + c * p[1] + e, b * p[0] + d * p[1] + f)

    def _moveTo(self, p):
        self.contours.append([self._map(p)])

    def _lineTo(self, p):
        self.contours[-1].append(self._map(p))

    def _qCurveToOne(self, p1, p2):
        p0 = self._getCurrentPoint()
        for i in range(1, 17):
            t = i / 16
            x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
            y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
            self.contours[-1].append(self._map((x, y)))

    def _curveToOne(self, p1, p2, p3):
        p0 = self._getCurrentPoint()
        for i in range(1, 17):
            t = i / 16
            u = 1 - t
            x = u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0]
            y = u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]
            self.contours[-1].append(self._map((x, y)))


def draw_text(image: Image.Image, font: TTFont, placed, transform, fill: str) -> None:
    """Paints placed glyphs onto `image` (even-odd per glyph, glyphs united), anti-aliased."""
    w, h = image.size
    s = SUPERSAMPLE
    a, b, c, d, e, f = transform
    big = (a * s, b * s, c * s, d * s, e * s, f * s)
    coverage = Image.new("1", (w * s, h * s), 0)
    glyph_set = font.getGlyphSet()
    for name, x in placed:
        pen = FlattenPen(glyph_set, (big[0], big[1], big[2], big[3], big[0] * x + big[4], big[1] * x + big[5]))
        glyph_set[name].draw(pen)
        glyph = Image.new("1", coverage.size, 0)
        for contour in pen.contours:
            if len(contour) < 3:
                continue
            ring = Image.new("1", coverage.size, 0)
            ImageDraw.Draw(ring).polygon(contour, fill=1)
            glyph = ImageChops.logical_xor(glyph, ring)
        coverage = ImageChops.logical_or(coverage, glyph)
    mask = coverage.convert("L").resize((w, h), Image.Resampling.BOX)
    image.paste(Image.new(image.mode, image.size, fill), (0, 0), mask)


def fit(font: TTFont, placed, box: tuple[float, float, float, float]):
    """Transform scaling the ink box of `placed` to height box[3]-box[1], centred in `box`."""
    x0, y0, x1, y1 = ink_box(font, placed)
    scale = (box[3] - box[1]) / (y1 - y0)
    cx = (box[0] + box[2]) / 2 - scale * (x0 + x1) / 2
    cy = (box[1] + box[3]) / 2 + scale * (y0 + y1) / 2
    return (scale, 0, 0, -scale, cx, cy)


E = layout(bold, "e")
WORDMARK = layout(bold, "eclalune", TRACKING)


def mark_transform(side: float):
    g = side * GLYPH_SHARE
    return fit(bold, E, ((side - g) / 2, (side - g) / 2, (side + g) / 2, (side + g) / 2))


def mark_png(side: int, ink: str = INK, paper: str = WHITE) -> Image.Image:
    image = Image.new("RGB", (side, side), ink)
    draw_text(image, bold, E, mark_transform(side), paper)
    return image


def write(path: Path, data: bytes | str) -> None:
    path.write_bytes(data if isinstance(data, bytes) else data.encode())
    print(f"wrote {path.relative_to(APP.parent)}")


def mark_svg() -> str:
    d = svg_path(bold, E, mark_transform(1000))
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">'
        f'<rect width="1000" height="1000" fill="{INK}"/>'
        f'<path d="{d}" fill="{WHITE}"/></svg>\n'
    )


def og_image(tagline: str) -> Image.Image:
    width, height = 1200, 630
    image = Image.new("RGB", (width, height), INK)
    # Centred so a square crop of the middle (WhatsApp, some feeds) still shows the mark and
    # the name.
    side, gap, word_height, tagline_drop = 112, 56, 104, 74
    top = (height - (side + gap + word_height + tagline_drop)) // 2
    left = (width - side) // 2
    square = mark_png(side * 4, ink=WHITE, paper=INK).resize((side, side), Image.Resampling.LANCZOS)
    image.paste(square, (left, top))
    word_top = top + side + gap
    x0, y0, x1, y1 = ink_box(bold, WORDMARK)
    scale = word_height / (y1 - y0)
    word_width = (x1 - x0) * scale
    draw_text(
        image,
        bold,
        WORDMARK,
        fit(bold, WORDMARK, ((width - word_width) / 2, word_top, (width + word_width) / 2, word_top + word_height)),
        WHITE,
    )
    line = layout(medium, tagline, -0.01)
    lx0, ly0, lx1, ly1 = ink_box(medium, line)
    line_scale = 34 / medium["head"].unitsPerEm
    line_width = (lx1 - lx0) * line_scale
    baseline = word_top + word_height + tagline_drop
    draw_text(
        image,
        medium,
        line,
        (line_scale, 0, 0, -line_scale, (width - line_width) / 2 - lx0 * line_scale, baseline),
        TAGLINE_GREY,
    )
    return image


def png(image: Image.Image) -> bytes:
    out = BytesIO()
    image.save(out, "PNG", optimize=True)
    return out.getvalue()


def main() -> None:
    svg = mark_svg()
    write(PUBLIC / "logo-mark.svg", svg)
    write(PUBLIC / "favicon.svg", svg)

    for name, side in [
        ("favicon-48.png", 48),
        ("favicon-96.png", 96),
        ("apple-touch-icon.png", 180),
        ("icon-192.png", 192),
        ("icon-512.png", 512),
        ("logo.png", 512),
    ]:
        write(PUBLIC / name, png(mark_png(side)))
    # The glyph stays inside the 80% safe circle of a maskable icon (its farthest corner is
    # about 33% of the side from the centre), so the maskable icon is the same full-bleed art.
    write(PUBLIC / "icon-maskable-512.png", png(mark_png(512)))

    ico = BytesIO()
    frames = [mark_png(s) for s in (48, 32, 16)]
    frames[0].save(ico, "ICO", sizes=[(48, 48), (32, 32), (16, 16)], append_images=frames[1:])
    write(PUBLIC / "favicon.ico", ico.getvalue())

    write(PUBLIC / "og-default.png", png(og_image("Belleza y cuidado personal")))
    write(PUBLIC / "og-default-en.png", png(og_image("Beauty and personal care")))

    x0, y0, x1, y1 = ink_box(bold, WORDMARK)
    wordmark = svg_path(bold, WORDMARK, (1, 0, 0, -1, -x0, y1))
    write(
        WORDMARK_MASTER,
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {round(x1 - x0)} {round(y1 - y0)}">'
        f'<path d="{wordmark}" fill="{INK}"/></svg>\n',
    )
    cutout = "M0 0H1000V1000H0Z" + svg_path(bold, E, mark_transform(1000))
    write(
        BRAND_PATHS,
        "// Generated by scripts/brand_assets.py from the Satoshi Bold outlines; do not edit.\n"
        "// The wordmark is in font units (1000 per em); the mark is a 1000 x 1000 square minus\n"
        '// the "e" (even-odd), so the letter shows whatever is behind the mark.\n'
        "export const WORDMARK = {\n"
        f"\twidth: {round(x1 - x0)},\n"
        f"\theight: {round(y1 - y0)},\n"
        f'\tpath: "{wordmark}",\n'
        "};\n"
        f'export const MARK_CUTOUT_PATH =\n\t"{cutout}";\n',
    )


if __name__ == "__main__":
    main()
