// Served from R2 under their content key, like uploaded ones: build.ts registers them,
// media.ts uploads them.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha256Hex } from '../src/server/domain/hash'
import { mediaKey, readImageInfo } from '../src/server/domain/images'

const IMAGES_DIR = join(import.meta.dir, 'images')
const EDITORIAL_DIR = join(import.meta.dir, 'editorial')

async function seedImage(dir: string, file: string) {
  const path = join(dir, file)
  if (!existsSync(path)) throw new Error(`${path} is missing`)
  const bytes = new Uint8Array(readFileSync(path))
  const info = readImageInfo(bytes)
  if (!info) throw new Error(`${file} is not a readable JPEG, PNG, WebP or AVIF`)
  return { path, key: mediaKey(await sha256Hex(bytes), info.contentType), byteSize: bytes.byteLength, ...info }
}

type CatalogProduct = { brand: string; name: string; image: string; lifestyle?: boolean }

// Alt text is the brand and product name (the same in every locale) until better copy
// exists.
export function catalogPhotos(products: CatalogProduct[], brandName: (slug: string) => string) {
  return Promise.all(
    products.flatMap((p, i) =>
      [
        { file: `${p.image}.webp`, kind: 'packshot' },
        ...(p.lifestyle ? [{ file: `${p.image}-life.webp`, kind: 'lifestyle' }] : []),
      ].map(async (photo, position) => ({ productId: i + 1, position, kind: photo.kind, file: photo.file, alt: `${brandName(p.brand)} ${p.name}`, ...(await seedImage(IMAGES_DIR, photo.file)) })),
    ),
  )
}

type EditorialEntry = { file: string; alt: Record<string, string>; credit: string; sourceUrl: string; license: string; licenseUrl: string }

export function editorialPhotos() {
  const manifest = join(EDITORIAL_DIR, 'manifest.json')
  if (!existsSync(manifest)) throw new Error(`${manifest} is missing`)
  const entries = JSON.parse(readFileSync(manifest, 'utf8')) as EditorialEntry[]
  return Promise.all(entries.map(async (e) => ({ ...e, ...(await seedImage(EDITORIAL_DIR, e.file)) })))
}
