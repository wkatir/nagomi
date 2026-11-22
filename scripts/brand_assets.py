import math
from io import BytesIO
from pathlib import Path

import resvg_py
from fontTools.pens.basePen import BasePen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image

APP = Path(__file__).resolve().parent.parent
PUBLIC = APP / "public"
BRAND_PATHS = APP / "src/components/brand/brand-paths.ts"
SERIF_FILES = APP / "node_modules/@fontsource-variable/noto-serif-jp/files"
SANS_FILES = APP / "node_modules/@fontsource-variable/inter/files"

BACKGROUND = "#0d0d17"
VIOLET = "#8b7cf6"
VIOLET_LIGHT = "#a78bfa"
LAVENDER = "#e6e1ff"
MUTED = "#9b97b8"

TAGLINES = {
    "og-default.png": "Periféricos y accesorios para tu setup",
    "og-default-en.png": "Peripherals and accessories for your setup",
}

MARK = {
    "regular": {"radius": 41.5, "width": 8.6, "weight": 700, "height": 53, "cy": 50.5},
    "small": {"radius": 40, "width": 13, "weight": 900, "height": 56, "cy": 50.5},
}


def fmt(value: float) -> str:
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def font(path: Path, weight: int) -> TTFont:
    face = TTFont(path)
    return instantiateVariableFont(face, {"wght": weight}) if "fvar" in face else face


def pair_kerning(face: TTFont, first: str, second: str) -> float:
    if "GPOS" not in face:
        return 0
    table = face["GPOS"].table
    indices = {
        i
        for record in table.FeatureList.FeatureRecord
        if record.FeatureTag == "kern"
        for i in record.Feature.LookupListIndex
    }
    for index in sorted(indices):
        lookup = table.LookupList.Lookup[index]
        for sub in lookup.SubTable:
            kind = lookup.LookupType
            if kind == 9:
                kind, sub = sub.ExtensionLookupType, sub.ExtSubTable
            if kind != 2 or first not in sub.Coverage.glyphs:
                continue
            if sub.Format == 1:
                pairs = sub.PairSet[sub.Coverage.glyphs.index(first)].PairValueRecord
                for record in pairs:
                    if record.SecondGlyph == second and record.Value1:
                        return getattr(record.Value1, "XAdvance", 0) or 0
            else:
                row = sub.Class1Record[sub.ClassDef1.classDefs.get(first, 0)]
                value = row.Class2Record[sub.ClassDef2.classDefs.get(second, 0)].Value1
                if value and getattr(value, "XAdvance", 0):
                    return value.XAdvance
    return 0


class Recorder(BasePen):
    def __init__(self, glyph_set):
        super().__init__(glyph_set)
        self.value = []

    def _moveTo(self, pt):
        self.value.append(("moveTo", (pt,)))

    def _lineTo(self, pt):
        self.value.append(("lineTo", (pt,)))

    def _curveToOne(self, p1, p2, p3):
        self.value.append(("curveTo", (p1, p2, p3)))

    def _qCurveToOne(self, p1, p2):
        self.value.append(("qCurveTo", (p1, p2)))

    def _closePath(self):
        self.value.append(("closePath", ()))

    def _endPath(self):
        self.value.append(("closePath", ()))


def outline(face: TTFont, text: str, size: float, tracking: float = 0.0) -> tuple[list, float]:
    glyphs = face.getGlyphSet()
    cmap = face.getBestCmap()
    scale = size / face["head"].unitsPerEm
    names = [cmap[ord(ch)] for ch in text]
    pen = Recorder(glyphs)
    x = 0.0
    for i, name in enumerate(names):
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, 0)))
        x += glyphs[name].width * scale
        if i + 1 < len(names):
            x += pair_kerning(face, name, names[i + 1]) * scale + tracking * size
    return pen.value, x


def bounds(commands: list) -> tuple[float, float, float, float]:
    points = [p for _, args in commands for p in args]
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def place(commands: list, dx: float, dy: float, scale: float = 1.0) -> list:
    return [(op, tuple((x * scale + dx, y * scale + dy) for x, y in args)) for op, args in commands]


def pair(point: tuple[float, float]) -> str:
    return f"{fmt(point[0])} {fmt(point[1])}"


def to_d(commands: list) -> str:
    letters = {"moveTo": "M", "lineTo": "L", "curveTo": "C", "qCurveTo": "Q", "closePath": "Z"}
    parts = []
    for op, args in commands:
        parts.append(letters[op] + " ".join(pair(p) for p in args))
    return "".join(parts)


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = min(1.0, max(0.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def catmull_rom(points: list) -> str:
    n = len(points)
    d = [f"M{pair(points[0])}"]
    for i in range(n):
        p0, p1, p2, p3 = points[i - 1], points[i], points[(i + 1) % n], points[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f"C{pair(c1)} {pair(c2)} {pair(p2)}")
    return "".join(d) + "Z"


def enso(cx: float, cy: float, radius: float, width: float, dry: bool, steps: int = 72) -> str:
    start = math.radians(-58)
    sweep = math.radians(-328)

    def centre(t: float) -> tuple[float, float]:
        a = start + sweep * t
        wobble = 0.018 * math.sin(2 * math.pi * 1.1 * t + 0.7) + 0.011 * math.sin(2 * math.pi * 2.6 * t + 2.1)
        r = radius * (1 + wobble) * (1 - 0.05 * smoothstep(0.84, 1.0, t))
        return cx + r * math.cos(a) * 1.01, cy + r * math.sin(a) * 0.99

    def profile(t: float) -> float:
        rise = 0.72 + 0.28 * smoothstep(0.0, 0.1, t)
        body = 1 + 0.1 * math.sin(2 * math.pi * (1.3 * t + 0.1))
        fall = 1 - 0.93 * smoothstep(0.8, 1.0, t) ** 1.5
        return rise * body * fall

    def frame(t: float) -> tuple[tuple[float, float], tuple[float, float], tuple[float, float]]:
        eps = 1e-4
        a, b = centre(max(0.0, t - eps)), centre(min(1.0, t + eps))
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        tangent = ((b[0] - a[0]) / length, (b[1] - a[1]) / length)
        return centre(t), tangent, (tangent[1], -tangent[0])

    outer, inner = [], []
    for i in range(steps + 1):
        t = i / steps
        (x, y), _, (nx, ny) = frame(t)
        w = width * profile(t)
        bias = 0.5 + 0.06 * math.sin(2 * math.pi * 1.7 * t + 0.3)
        grain = 1 + 0.035 * math.sin(2 * math.pi * 9 * t + 1.1) if dry else 1
        outer.append((x + nx * w * bias * grain, y + ny * w * bias * grain))
        inner.append((x - nx * w * (1 - bias), y - ny * w * (1 - bias)))

    (x0, y0), (tx, ty), (nx, ny) = frame(0)
    w0 = width * profile(0)
    head = []
    for k in range(1, 6):
        phi = math.pi - math.pi * k / 6
        head.append(
            (
                x0 + nx * w0 * 0.5 * math.cos(phi) - tx * w0 * 0.55 * math.sin(phi),
                y0 + ny * w0 * 0.5 * math.cos(phi) - ty * w0 * 0.55 * math.sin(phi),
            )
        )
    ring = catmull_rom(outer + inner[::-1] + head)
    if not dry:
        return ring
    streaks = []
    for t0, t1, offset, thickness in ((0.66, 0.9, 0.12, 0.09), (0.76, 0.95, -0.2, 0.07)):
        upper, lower = [], []
        n = 18
        for i in range(n + 1):
            t = t0 + (t1 - t0) * i / n
            (x, y), _, (nx, ny) = frame(t)
            w = width * profile(t)
            half = w * thickness * math.sin(math.pi * i / n) ** 0.8
            centre_offset = w * offset
            upper.append((x + nx * (centre_offset + half), y + ny * (centre_offset + half)))
            lower.append((x + nx * (centre_offset - half), y + ny * (centre_offset - half)))
        streaks.append(catmull_rom(lower + upper[-2:0:-1]))
    return ring + "".join(streaks)


def kanji(weight: int, height: float, cx: float, cy: float) -> str:
    face = font(SERIF_FILES / "noto-serif-jp-112-wght-normal.woff2", weight)
    commands, _ = outline(face, "和", 100)
    x0, y0, x1, y1 = bounds(commands)
    scale = height / (y1 - y0)
    return to_d(place(commands, cx - (x0 + x1) / 2 * scale, cy - (y0 + y1) / 2 * scale, scale))


def mark_paths(variant: str) -> tuple[str, str]:
    spec = MARK[variant]
    return enso(50, 50, spec["radius"], spec["width"], variant == "regular"), kanji(spec["weight"], spec["height"], 50, spec["cy"])


def lockup() -> dict:
    serif_latin = font(SERIF_FILES / "noto-serif-jp-latin-wght-normal.woff2", 300)
    serif_kana = font(SERIF_FILES / "noto-serif-jp-119-wght-normal.woff2", 400)
    word, _ = outline(serif_latin, "Nagomi", 50, 0.01)
    wx0, _, wx1, _ = bounds(word)
    word_x, word_y = 114 - wx0, 60
    kana, _ = outline(serif_kana, "なごみ", 17, 0.22)
    kx0, _, kx1, ky1 = bounds(kana)
    kana_x, kana_y = 116 - kx0, 87 - ky1
    return {
        "word": to_d(place(word, word_x, word_y)),
        "kana": to_d(place(kana, kana_x, kana_y)),
        "width": math.ceil(max(word_x + wx1, kana_x + kx1) + 2),
    }


def svg(width: float, height: float, body: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(width)} {fmt(height)}" '
        f'width="{fmt(width)}" height="{fmt(height)}">{body}</svg>'
    )


def render(markup: str) -> Image.Image:
    return Image.open(BytesIO(bytes(resvg_py.svg_to_bytes(svg_string=markup)))).convert("RGBA")


def tile(size: int, variant: str, share: float, radius: float) -> str:
    ring, glyph = mark_paths(variant)
    scale = size * share / 100
    offset = (size - 100 * scale) / 2
    corner = f' rx="{fmt(size * radius)}"' if radius else ""
    return svg(
        size,
        size,
        f'<rect width="{size}" height="{size}"{corner} fill="{BACKGROUND}"/>'
        f'<g transform="translate({fmt(offset)} {fmt(offset)}) scale({fmt(scale)})" fill="{VIOLET_LIGHT}">'
        f'<path d="{ring}"/><path d="{glyph}"/></g>',
    )


def og(name: str, tagline: str, parts: dict) -> None:
    ring, glyph = mark_paths("regular")
    width, height, scale = 1200, 630, 2.3
    lx, ly = (width - parts["width"] * scale) / 2, 168
    line, line_w = outline(font(SANS_FILES / "inter-latin-wght-normal.woff2", 400), tagline, 34, -0.005)
    body = (
        '<defs><radialGradient id="glow" cx="50%" cy="42%" r="62%">'
        f'<stop offset="0" stop-color="{VIOLET}" stop-opacity="0.2"/>'
        f'<stop offset="0.4" stop-color="{VIOLET}" stop-opacity="0.08"/>'
        f'<stop offset="1" stop-color="{VIOLET}" stop-opacity="0"/>'
        "</radialGradient></defs>"
        f'<rect width="{width}" height="{height}" fill="{BACKGROUND}"/>'
        f'<rect width="{width}" height="{height}" fill="url(#glow)"/>'
        f'<g transform="translate({fmt(lx)} {fmt(ly)}) scale({scale})">'
        f'<g fill="{VIOLET_LIGHT}"><path d="{ring}"/><path d="{glyph}"/></g>'
        f'<path d="{parts["word"]}" fill="{LAVENDER}"/>'
        f'<path d="{parts["kana"]}" fill="{MUTED}"/></g>'
        f'<rect x="{fmt(width / 2 - 28)}" y="418" width="56" height="2" rx="1" fill="{VIOLET}" opacity="0.7"/>'
        f'<path d="{to_d(place(line, (width - line_w) / 2, 470))}" fill="{MUTED}"/>'
    )
    render(svg(width, height, body)).convert("RGB").save(PUBLIC / name, optimize=True)


def main() -> None:
    ring, glyph = mark_paths("regular")
    small_ring, small_glyph = mark_paths("small")
    parts = lockup()

    (PUBLIC / "logo-mark.svg").write_text(
        svg(100, 100, f'<g fill="currentColor"><path d="{ring}"/><path d="{glyph}"/></g>'), encoding="utf-8"
    )
    (PUBLIC / "logo.svg").write_text(
        svg(
            parts["width"],
            100,
            f'<g fill="currentColor"><path d="{ring}"/><path d="{glyph}"/>'
            f'<path d="{parts["word"]}"/><path d="{parts["kana"]}"/></g>',
        ),
        encoding="utf-8",
    )
    (PUBLIC / "favicon.svg").write_text(tile(100, "small", 0.84, 0.22), encoding="utf-8")

    icons = {
        16: render(tile(16, "small", 0.9, 0.22)),
        32: render(tile(32, "small", 0.88, 0.22)),
        48: render(tile(48, "small", 0.86, 0.22)),
        96: render(tile(96, "regular", 0.8, 0.22)),
    }
    icons[48].save(PUBLIC / "favicon-48.png", optimize=True)
    icons[96].save(PUBLIC / "favicon-96.png", optimize=True)
    icons[48].save(
        PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[icons[16], icons[32]]
    )

    render(tile(180, "regular", 0.74, 0)).convert("RGB").save(PUBLIC / "apple-touch-icon.png", optimize=True)
    render(tile(192, "regular", 0.78, 0.22)).save(PUBLIC / "icon-192.png", optimize=True)
    render(tile(512, "regular", 0.78, 0.22)).save(PUBLIC / "icon-512.png", optimize=True)
    render(tile(512, "regular", 0.62, 0)).convert("RGB").save(PUBLIC / "icon-maskable-512.png", optimize=True)
    render(tile(512, "regular", 0.76, 0)).convert("RGB").save(PUBLIC / "logo.png", optimize=True)

    for name, tagline in TAGLINES.items():
        og(name, tagline, parts)

    constants = {
        "MARK_RING": ring,
        "MARK_GLYPH": glyph,
        "MARK_RING_SMALL": small_ring,
        "MARK_GLYPH_SMALL": small_glyph,
        "WORDMARK": parts["word"],
        "WORDMARK_KANA": parts["kana"],
    }
    lines = [f'export const {name} =\n\t"{value}";\n' for name, value in constants.items()]
    lines.append(f"export const LOGO_WIDTH = {parts['width']};\n")
    BRAND_PATHS.write_text("".join(lines), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
