// Uploads under the keys seed.sql gives the photos. Pass the wrangler target, e.g.:
//   bun seed/media.ts --local [--persist-to <dir>]
//   bun seed/media.ts --remote   (production, only with authorization)
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { catalogPhotos, editorialPhotos } from './images'

const args = process.argv.slice(2)
if (args.includes('--local') === args.includes('--remote')) {
  console.error('Pass exactly one of --local or --remote.')
  process.exit(1)
}

const config = JSON.parse(readFileSync(join(import.meta.dir, '../wrangler.jsonc'), 'utf8')) as { r2_buckets: { binding: string; bucket_name: string }[] }
const bucket = config.r2_buckets.find((b) => b.binding === 'MEDIA')?.bucket_name
if (!bucket) throw new Error('wrangler.jsonc has no R2 bucket bound as MEDIA')

const catalog = JSON.parse(readFileSync(join(import.meta.dir, 'catalog.json'), 'utf8')) as { brands: { slug: string; name: string }[]; products: Parameters<typeof catalogPhotos>[0] }
const brandName = (slug: string) => {
  const brand = catalog.brands.find((b) => b.slug === slug)
  if (!brand) throw new Error(`Unknown brand ${slug}`)
  return brand.name
}
const photos = [...(await catalogPhotos(catalog.products, brandName)), ...(await editorialPhotos())]
const unique = [...new Map(photos.map((p) => [p.key, p])).values()]

for (const image of unique) {
  const result = spawnSync('bunx', ['wrangler', 'r2', 'object', 'put', `${bucket}/${image.key}`, `--file=${image.path}`, `--content-type=${image.contentType}`, ...args], { stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' })
  if (result.status !== 0) {
    console.error(`Upload of ${image.file} failed.`)
    process.exit(result.status ?? 1)
  }
  console.log(`${image.file} -> ${image.key}`)
}
