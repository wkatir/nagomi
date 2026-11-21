// Photos are registered under their R2 key; `bun seed/media.ts` uploads them.
// Run: bun seed/build.ts && bun run db:seed && bun run media:seed
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { LOCALES, SKIN_TYPES } from '../src/db/schema'
import { usesReturnWindow } from '../src/lib/promises'
import { normalizePhone } from '../src/server/domain/phone'
import { searchKey } from '../src/server/domain/search'
import { isStorePath } from '../src/lib/store-path'
import { catalogPhotos, editorialPhotos } from './images'
import { readLanding } from './landing'
import { lit } from './sql'

type Text = Record<string, string>
// Lists (key ingredients, benefits) are stored one item per line.
type ProductText = {
  tagline: string
  description: string
  keyIngredients: string | string[]
  howToUse?: string
  benefits?: string[]
  cautions?: string
}
type Catalog = {
  settings: {
    name: string
    currency: string
    defaultLocale: string
    email: string
    // E.164 (+50362862515); stored as digits, as wa.me expects.
    whatsappNumber?: string
    legalName?: string
    timeZone: string
    countryCode: string
    taxIdLabel: string
    orderCodePrefix: string
    maxQuantityPerLine: number
    minShelfLifeDays: number
    expiryWarningDays: number
    returnWindowDays: number | null
    foundingYear: number | null
    acceptedPaymentMethods: string[]
  }
  // Facts only.
  promises: { slug: string; published: boolean; es: { title: string; body: string | null }; en: { title: string; body: string | null } }[]
  brands: { slug: string; name: string; countryCode: string; es?: { description: string }; en?: { description: string } }[]
  categories: ({ slug: string; routineStep: number } & Text)[]
  concerns: ({ slug: string } & Text)[]
  products: {
    slug: string
    brand: string
    category: string
    status: 'draft' | 'published' | 'archived'
    image: string
    lifestyle?: boolean
    concerns: string[]
    skinTypes?: string[]
    name: string
    // As printed on the pack; not translated.
    inci?: string
    variant: { sku: string; size?: number; unit?: string; price?: number }
    es: ProductText
    en: ProductText
  }[]
  routines: { slug: string; published: boolean; featured: boolean; skus: string[]; es: Text; en: Text }[]
  suppliers: { name: string; contactName: string; notes: string }[]
  purchaseOrders: { supplier: string; reference: string; status: string; orderedOn: string | null; notes: string; items: { sku: string; quantity: number; unitCost: number }[] }[]
  // Only zones whose fee is known; without zones the storefront says shipping is confirmed
  // on WhatsApp.
  shippingZones: { slug: string; method: string; fee: number; freeFrom: number | null; deliveryDaysMin: number; deliveryDaysMax: number; es: { name: string; description: string | null }; en: { name: string; description: string | null } }[]
}
// Alt text comes from the seed/editorial manifest.
type Home = {
  slides: { image: string; mobileImage?: string; linkPath: string; es: SlideText; en: SlideText }[]
}
type SlideText = { title: string; body: string | null; ctaLabel: string | null }
// Products by slug: SKUs may change while sizes are confirmed.
type Collections = {
  slug: string
  showOnHome: boolean
  cover?: string
  products: string[]
  es: { title: string; description: string | null }
  en: { title: string; description: string | null }
}[]

const dir = import.meta.dir
const readJson = <T,>(file: string): T => JSON.parse(readFileSync(join(dir, file), 'utf8'))
const data = readJson<Catalog>('catalog.json')
const home = readJson<Home>('home.json')
const collections = readJson<Collections>('collections.json')

const insert = (table: string, rows: Record<string, unknown>[]) => {
  if (rows.length === 0) return ''
  const cols = Object.keys(rows[0]!)
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES\n${rows.map((r) => `  (${cols.map((c) => lit(r[c])).join(', ')})`).join(',\n')};\n`
}
// Ids follow array order so foreign keys can be resolved without round trips.
const idOf = <T,>(list: T[], key: (t: T) => string, value: string) => {
  const i = list.findIndex((t) => key(t) === value)
  if (i < 0) throw new Error(`Unknown reference: ${value}`)
  return i + 1
}
const bySlug = <T extends { slug: string }>(list: T[], slug: string) => idOf(list, (t) => t.slug, slug)
const skuId = (sku: string) => idOf(data.products, (p) => p.variant.sku, sku)

const pageFiles = readdirSync(join(dir, 'pages')).filter((f) => f.endsWith('.md'))
const pageSlugs = [...new Set(pageFiles.map((f) => f.split('.')[0]!))]
const page = (slug: string, locale: string) => {
  const raw = readFileSync(join(dir, 'pages', `${slug}.${locale}.md`), 'utf8').trim()
  const [first, ...rest] = raw.split('\n')
  if (!first.startsWith('# ')) throw new Error(`${slug}.${locale}.md must start with "# Title"`)
  return { title: first.slice(2).trim(), body: rest.join('\n').trim() }
}

const unbacked = data.promises.find((p) => p.published && usesReturnWindow(LOCALES.map((l) => p[l])) && data.settings.returnWindowDays === null)
if (unbacked) throw new Error(`Promise ${unbacked.slug} quotes the return window but settings.returnWindowDays is null`)

const brandName = (slug: string) => data.brands[bySlug(data.brands, slug) - 1]!.name
const photos = await catalogPhotos(data.products, brandName)
const published = data.products.flatMap((p, i) => (p.status === 'published' ? [i + 1] : []))

const editorial = await editorialPhotos()
// One media_files row per content key: a file used twice is one row.
const files = [...new Map([...photos, ...editorial].map((f) => [f.key, f])).values()]
const fileId = (key: string) => {
  const index = files.findIndex((f) => f.key === key)
  if (index < 0) throw new Error(`No media file for ${key}`)
  return index + 1
}
const editorialIndex = (file: string) => idOf(editorial, (e) => e.file, file)
const mediaId = (file: string) => fileId(editorial[editorialIndex(file) - 1]!.key)
const editorialAlt = (file: string, locale: string) => {
  const alt = editorial[editorialIndex(file) - 1]!.alt[locale]
  if (!alt) throw new Error(`seed/editorial/manifest.json has no ${locale} alt text for ${file}`)
  return alt
}
const badLink = home.slides.find((s) => !isStorePath(s.linkPath))
if (badLink) throw new Error(`Slide link ${badLink.linkPath} is not a storefront path`)

const badSkinType = data.products.flatMap((p) => (p.skinTypes ?? []).filter((s) => !(SKIN_TYPES as readonly string[]).includes(s)).map((s) => `${p.slug}: ${s}`))
if (badSkinType.length) throw new Error(`Unknown skin types: ${badSkinType.join(', ')}`)
const lines = (v: string | string[] | undefined) => (v === undefined ? null : Array.isArray(v) ? v.join('\n') : v)

const landing = readLanding({ concerns: data.concerns.map((c) => c.slug), categories: data.categories.map((c) => c.slug), routines: data.routines.map((r) => r.slug) })

const settings = data.settings
const whatsappNumber = settings.whatsappNumber ? normalizePhone(settings.whatsappNumber, settings.countryCode).slice(1) : null

const sql = [
  '-- Generated by seed/build.ts. Do not edit by hand.',
  insert('store_settings', [{ id: 1, name: settings.name, currency: settings.currency, default_locale: settings.defaultLocale, email: settings.email, whatsapp_number: whatsappNumber, legal_name: settings.legalName ?? null, time_zone: settings.timeZone, country_code: settings.countryCode, tax_id_label: settings.taxIdLabel, order_code_prefix: settings.orderCodePrefix, max_quantity_per_line: settings.maxQuantityPerLine, min_shelf_life_days: settings.minShelfLifeDays, expiry_warning_days: settings.expiryWarningDays, return_window_days: settings.returnWindowDays, founding_year: settings.foundingYear }]),
  insert('store_payment_methods', settings.acceptedPaymentMethods.map((method) => ({ method }))),
  insert('store_promises', data.promises.map((p, i) => ({ id: i + 1, slug: p.slug, position: i, is_published: p.published }))),
  insert('store_promise_translations', data.promises.flatMap((p, i) => LOCALES.map((l) => ({ promise_id: i + 1, locale: l, title: p[l].title, body: p[l].body })))),
  insert('shipping_zones', data.shippingZones.map((z, i) => ({ id: i + 1, slug: z.slug, method: z.method, fee: z.fee, free_from: z.freeFrom, delivery_days_min: z.deliveryDaysMin, delivery_days_max: z.deliveryDaysMax, position: i }))),
  insert('shipping_zone_translations', data.shippingZones.flatMap((z, i) => LOCALES.map((l) => ({ zone_id: i + 1, locale: l, name: z[l].name, description: z[l].description })))),
  insert('brands', data.brands.map((b, i) => ({ id: i + 1, slug: b.slug, name: b.name, search_key: searchKey(b.name, b.slug), country_code: b.countryCode }))),
  insert('brand_translations', data.brands.flatMap((b, i) => LOCALES.flatMap((l) => (b[l] ? [{ brand_id: i + 1, locale: l, description: b[l].description }] : [])))),
  insert('categories', data.categories.map((c, i) => ({ id: i + 1, slug: c.slug, routine_step: c.routineStep }))),
  insert('category_translations', data.categories.flatMap((c, i) => LOCALES.map((l) => ({ category_id: i + 1, locale: l, name: c[l], description: landing.categories[c.slug]![l]!.description, seo_title: landing.categories[c.slug]![l]!.seoTitle, seo_description: landing.categories[c.slug]![l]!.seoDescription })))),
  insert('concerns', data.concerns.map((c, i) => ({ id: i + 1, slug: c.slug, position: i }))),
  insert('concern_translations', data.concerns.flatMap((c, i) => LOCALES.map((l) => ({ concern_id: i + 1, locale: l, name: c[l], description: landing.concerns[c.slug]![l]!.description, seo_title: landing.concerns[c.slug]![l]!.seoTitle, seo_description: landing.concerns[c.slug]![l]!.seoDescription })))),
  // Inserted as drafts: a product is published once it has a priced variant (trigger).
  insert('products', data.products.map((p, i) => ({ id: i + 1, slug: p.slug, brand_id: bySlug(data.brands, p.brand), category_id: bySlug(data.categories, p.category), status: p.status === 'published' ? 'draft' : p.status, inci: p.inci ?? null }))),
  insert('product_translations', data.products.flatMap((p, i) => LOCALES.map((l) => ({ product_id: i + 1, locale: l, name: p.name, search_key: searchKey(p.name), tagline: p[l].tagline, description: p[l].description, how_to_use: p[l].howToUse ?? null, key_ingredients: lines(p[l].keyIngredients), benefits: lines(p[l].benefits), cautions: p[l].cautions ?? null })))),
  insert('product_concerns', data.products.flatMap((p, i) => p.concerns.map((c) => ({ product_id: i + 1, concern_id: bySlug(data.concerns, c) })))),
  insert('product_skin_types', data.products.flatMap((p, i) => (p.skinTypes ?? []).map((skin_type) => ({ product_id: i + 1, skin_type })))),
  insert('variants', data.products.map((p, i) => ({ id: i + 1, product_id: i + 1, sku: p.variant.sku, search_key: searchKey(p.variant.sku), size_value: p.variant.size ?? null, size_unit: p.variant.unit ?? null, price: p.variant.price ?? null }))),
  published.length ? `UPDATE products SET status = 'published' WHERE id IN (${published.join(', ')});\n` : '',
  insert('media_files', files.map((f, i) => ({ id: i + 1, r2_key: f.key, content_type: f.contentType, byte_size: f.byteSize, width: f.width, height: f.height }))),
  insert('product_images', photos.map((ph, i) => ({ id: i + 1, product_id: ph.productId, media_file_id: fileId(ph.key), kind: ph.kind, position: ph.position }))),
  insert('product_image_translations', photos.flatMap((ph, i) => LOCALES.map((l) => ({ image_id: i + 1, locale: l, alt: ph.alt })))),
  insert('routines', data.routines.map((r, i) => ({ id: i + 1, slug: r.slug, status: r.published ? 'published' : 'draft', is_featured: r.featured, position: i, concern_id: landing.routines[r.slug] ? bySlug(data.concerns, landing.routines[r.slug]!) : null }))),
  insert('routine_translations', data.routines.flatMap((r, i) => LOCALES.map((l) => ({ routine_id: i + 1, locale: l, title: r[l].title, description: r[l].description })))),
  insert('routine_items', data.routines.flatMap((r, i) => r.skus.map((sku, n) => ({ routine_id: i + 1, variant_id: skuId(sku), position: n + 1 })))),
  insert('home_slides', home.slides.map((s, i) => ({ id: i + 1, status: 'published', position: i, desktop_media_id: mediaId(s.image), mobile_media_id: s.mobileImage ? mediaId(s.mobileImage) : null, link_path: s.linkPath }))),
  insert('home_slide_translations', home.slides.flatMap((s, i) => LOCALES.map((l) => ({ slide_id: i + 1, locale: l, title: s[l].title, body: s[l].body, cta_label: s[l].ctaLabel, image_alt: editorialAlt(s.image, l) })))),
  insert('collections', collections.map((c, i) => ({ id: i + 1, slug: c.slug, status: 'published', position: i, show_on_home: c.showOnHome, cover_media_id: c.cover ? mediaId(c.cover) : null }))),
  insert('collection_translations', collections.flatMap((c, i) => LOCALES.map((l) => ({ collection_id: i + 1, locale: l, title: c[l].title, description: c[l].description, cover_alt: c.cover ? editorialAlt(c.cover, l) : null })))),
  insert('collection_products', collections.flatMap((c, i) => c.products.map((slug, n) => ({ collection_id: i + 1, product_id: bySlug(data.products, slug), position: n + 1 })))),
  // Lead times are not known yet.
  insert('suppliers', data.suppliers.map((s, i) => ({ id: i + 1, name: s.name, contact_name: s.contactName, search_key: searchKey(s.name, s.contactName), notes: s.notes, lead_time_days: null }))),
  insert('purchase_orders', data.purchaseOrders.map((po, i) => ({ id: i + 1, supplier_id: idOf(data.suppliers, (s) => s.name, po.supplier), reference: po.reference, status: po.status, notes: po.notes, ordered_on: po.orderedOn }))),
  insert('purchase_order_items', data.purchaseOrders.flatMap((po, i) => po.items.map((it) => ({ purchase_order_id: i + 1, variant_id: skuId(it.sku), quantity: it.quantity, unit_cost: it.unitCost })))),
  // From the purchase orders; packs and minimums are not known.
  insert('supplier_items', [...new Map(data.purchaseOrders.flatMap((po) => po.items.map((it) => {
    const supplierId = idOf(data.suppliers, (s) => s.name, po.supplier)
    return [`${supplierId}:${it.sku}`, { supplier_id: supplierId, variant_id: skuId(it.sku), pack_size: null, min_order_quantity: null }] as const
  }))).values()]),
  insert('pages', pageSlugs.map((slug, i) => ({ id: i + 1, slug, is_published: true }))),

  // Version 1 of every text: checkout consents point at the exact version shown.
  insert('page_versions', pageSlugs.flatMap((slug, i) => LOCALES.map((l) => ({ page_id: i + 1, locale: l, version: 1, ...(({ title, body }) => ({ title, body_markdown: body }))(page(slug, l)) })))),
].join('\n')

writeFileSync(join(dir, 'seed.sql'), sql)
console.log(`seed.sql written: ${data.products.length} products, ${photos.length} photos, ${editorial.length} editorial photos, ${files.length} media files, ${home.slides.length} slides, ${collections.length} collections, ${pageSlugs.length} pages`)
