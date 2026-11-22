// Served from R2 under their content key, like uploaded ones: media.ts uploads them and
// registers their rows.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha256Hex } from '../src/server/domain/hash'
import { mediaKey, readImageInfo } from '../src/server/domain/images'

const IMAGES_DIR = join(import.meta.dir, 'images')
const EDITORIAL_DIR = join(import.meta.dir, 'editorial')
const EDITORIAL_MANIFEST = join(EDITORIAL_DIR, 'manifest.json')

async function seedImage(path: string, file: string) {
  const bytes = new Uint8Array(readFileSync(path))
  const info = readImageInfo(bytes)
  if (!info) throw new Error(`${file} is not a readable JPEG, PNG, WebP or AVIF`)
  return { key: mediaKey(await sha256Hex(bytes), info.contentType), byteSize: bytes.byteLength, ...info }
}

type CatalogProduct = { brand: string; name: string; image: string; lifestyle?: boolean }
type EditorialEntry = { file: string; alt: Record<string, string>; credit: string; sourceUrl: string; license: string; licenseUrl: string }

// Alt text is the brand and product name (the same in every locale) until better copy
// exists.
const catalogFiles = (products: CatalogProduct[], brandName: (slug: string) => string) =>
  products.flatMap((p, i) =>
    [
      { file: `${p.image}.webp`, kind: 'packshot' },
      ...(p.lifestyle ? [{ file: `${p.image}-life.webp`, kind: 'lifestyle' }] : []),
    ].map((photo, position) => ({ productId: i + 1, position, kind: photo.kind, file: photo.file, path: join(IMAGES_DIR, photo.file), alt: `${brandName(p.brand)} ${p.name}` })),
  )

// Every file the catalogue and seed/editorial/manifest.json name; the missing ones are
// reported together.
export async function seedPhotos(products: CatalogProduct[], brandName: (slug: string) => string) {
  const hasManifest = existsSync(EDITORIAL_MANIFEST)
  const entries = hasManifest ? (JSON.parse(readFileSync(EDITORIAL_MANIFEST, 'utf8')) as EditorialEntry[]) : []
  const catalog = catalogFiles(products, brandName)
  const editorial = entries.map((e) => ({ ...e, path: join(EDITORIAL_DIR, e.file) }))
  const missing = [...new Set([...(hasManifest ? [] : [EDITORIAL_MANIFEST]), ...[...catalog, ...editorial].map((f) => f.path).filter((path) => !existsSync(path))])]
  if (missing.length) throw new Error(`${missing.length} seed files are missing:\n${missing.map((path) => `  ${path}`).join('\n')}`)
  return {
    catalog: await Promise.all(catalog.map(async (p) => ({ ...p, ...(await seedImage(p.path, p.file)) }))),
    editorial: await Promise.all(editorial.map(async (e) => ({ ...e, ...(await seedImage(e.path, e.file)) }))),
  }
}
