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

type CatalogProduct = { sku: string; es: { name: string }; en: { name: string } }
type EditorialEntry = { file: string; alt: Record<string, string>; credit: string; sourceUrl: string; license: string; licenseUrl: string }

const catalogFiles = (products: CatalogProduct[]) =>
  products.map((p, i) => {
    const file = `${p.sku.toLowerCase()}.webp`
    return { productId: i + 1, position: 0, kind: 'packshot', file, path: join(IMAGES_DIR, file), alt: { es: p.es.name, en: p.en.name } as Record<string, string> }
  })

export async function seedPhotos(products: CatalogProduct[]) {
  const hasManifest = existsSync(EDITORIAL_MANIFEST)
  const entries = hasManifest ? (JSON.parse(readFileSync(EDITORIAL_MANIFEST, 'utf8')) as EditorialEntry[]) : []
  const catalog = catalogFiles(products)
  const editorial = entries.map((e) => ({ ...e, path: join(EDITORIAL_DIR, e.file) }))
  const missing = [...new Set([...(hasManifest ? [] : [EDITORIAL_MANIFEST]), ...[...catalog, ...editorial].map((f) => f.path).filter((path) => !existsSync(path))])]
  if (missing.length) throw new Error(`${missing.length} seed files are missing:\n${missing.map((path) => `  ${path}`).join('\n')}`)
  return {
    catalog: await Promise.all(catalog.map(async (p) => ({ ...p, ...(await seedImage(p.path, p.file)) }))),
    editorial: await Promise.all(editorial.map(async (e) => ({ ...e, ...(await seedImage(e.path, e.file)) }))),
  }
}
