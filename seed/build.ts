// The catalogue, settings, pages and purchasing history. Photos, home slides and collection
// covers need the image files, so `bun run media:seed` adds them afterwards.
// Run: bun run db:migrate && bun run db:seed && bun run media:seed
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATEGORY_ICONS, LOCALES, PRODUCT_BADGES, SKU_REGEX } from '../src/lib/enums'
import { usesReturnWindow } from '../src/lib/promises'
import { isSvMunicipality, SV_MUNICIPALITIES, SV_PHONE_REGEX } from '../src/lib/sv-locations'
import { normalizePhone } from '../src/server/domain/phone'
import { phoneDigits, searchKey } from '../src/server/domain/search'
import { demoSql } from './demo'
import { readLanding } from './landing'
import { insertMissing, lit, raw } from './sql'

type Locale = (typeof LOCALES)[number]
type PerLocale<T> = Record<Locale, T>
type ProductText = { name: string; tagline: string; shortSpecs: string; description: string; specs: [string, string][] }
type Catalog = {
  settings: {
    name: string
    currency: string
    defaultLocale: string
    email: string
    whatsappNumber: string | null
    phone: string | null
    legalName: string
    taxIdLabel: string
    taxId: string
    address: string
    timeZone: string
    countryCode: string
    orderCodePrefix: string
    maxQuantityPerLine: number
    returnWindowDays: number | null
    foundingYear: number | null
    freeShippingFrom: number
    lowStockThreshold: number
    frequentCustomerMinOrders: number
    inactiveCustomerDays: number
    followupPendingPaymentHours: number
    followupPaidUnshippedHours: number
    followupShippedUndeliveredHours: number
    taxRateBp: number
    bankName: string
    bankAccountType: string
    bankAccountNumber: string
    bankAccountHolder: string
    discordUrl: string
    instagramUrl: string
    tiktokUrl: string
    youtubeUrl: string
  }
  paymentMethods: { method: string; maxTotal: number | null; zone: string | null }[]
  promises: ({ slug: string; published: boolean } & PerLocale<{ title: string; body: string | null }>)[]
  brands: ({ slug: string; name: string; countryCode: string } & PerLocale<{ description: string }>)[]
  categories: ({ slug: string; sortOrder: number; icon: string } & PerLocale<{ name: string; subtitle: string }>)[]
  products: ({
    sku: string
    slug: string
    brand: string
    category: string
    featured: boolean
    badge?: string
    warrantyMonths: number
    price: number
    cost: number
    stock: number
    optionLabel: string | null
  } & PerLocale<ProductText>)[]
  bundles: ({ slug: string; published: boolean; featured: boolean; price: number; skus: string[] } & PerLocale<{ name: string; description: string }>)[]
  suppliers: { name: string; contactName: string; brands: string[]; leadTimeDays: number; notes: string }[]
  purchasing: {
    openingOrderedOn: string
    openingReceivedOn: string
    pending: { sku: string; quantity: number; orderedOn: string; reference: string }[]
  }
  shippingZones: ({
    slug: string
    method: string
    fee: number
    deliveryDaysMin: number
    deliveryDaysMax: number
    coversRest: boolean
    municipalities: string[]
  } & PerLocale<{ name: string; description: string }>)[]
  pages: Record<string, number | null>
  customers: {
    name: string
    email: string
    phone: string
    createdAt: string
    addresses: { recipient: string; department: string; municipality: string; line: string; reference: string; phone: string; default: boolean }[]
    consents: [string, boolean][]
  }[]
}
type Coupon = {
  code: string
  type: 'percentage' | 'fixed'
  value: number
  minSubtotal: number | null
  startsOn: string | null
  endsOn: string | null
  usageLimit: number | null
  perCustomerLimit: number | null
  firstOrderOnly: boolean
  status: string
} & PerLocale<{ description: string }>
type Collections = ({ slug: string; showOnHome: boolean; cover?: string; products: string[] } & PerLocale<{ title: string; description: string | null }>)[]

const dir = import.meta.dir
const readJson = <T,>(file: string): T => JSON.parse(readFileSync(join(dir, file), 'utf8'))
const data = readJson<Catalog>('catalog.json')
const collections = readJson<Collections>('collections.json')
const coupons = readJson<Coupon[]>('coupons.json')

const fail = (problems: string[], what: string) => {
  if (problems.length) throw new Error(`${what}:\n${problems.map((p) => `  ${p}`).join('\n')}`)
}
const idOf = <T,>(list: T[], key: (t: T) => string, value: string) => {
  const i = list.findIndex((t) => key(t) === value)
  if (i < 0) throw new Error(`Unknown reference: ${value}`)
  return i + 1
}
const bySlug = <T extends { slug: string }>(list: T[], slug: string) => idOf(list, (t) => t.slug, slug)
const skuId = (sku: string) => idOf(data.products, (p) => p.sku, sku)
const productOf = (sku: string) => data.products[skuId(sku) - 1]!
const [base, other] = LOCALES

fail(
  data.products.flatMap((p) => [
    ...(SKU_REGEX.test(p.sku) ? [] : [`${p.sku}: SKU must match ${SKU_REGEX}`]),
    ...(p.badge && !(PRODUCT_BADGES as readonly string[]).includes(p.badge) ? [`${p.sku}: unknown badge ${p.badge}`] : []),
    ...(existsSync(join(dir, 'images', `${p.sku.toLowerCase()}.webp`)) ? [] : [`${p.sku}: seed/images/${p.sku.toLowerCase()}.webp is missing`]),
    ...LOCALES.flatMap((l) => (p[l].specs.length < 3 || p[l].specs.length > 6 ? [`${p.sku}.${l}: ${p[l].specs.length} spec rows, expected 3 to 6`] : [])),
    ...(p[base].specs.length === p[other].specs.length ? [] : [`${p.sku}: spec rows differ between locales`]),
    ...(p.price > 0 && p.cost >= 0 && p.stock >= 0 && p.warrantyMonths >= 0 ? [] : [`${p.sku}: price, cost, stock or warranty out of range`]),
  ]),
  'Invalid products',
)
fail(
  data.categories.flatMap((c) => ((CATEGORY_ICONS as readonly string[]).includes(c.icon) ? [] : [`${c.slug}: unknown icon ${c.icon}`])),
  'Invalid categories',
)
fail(
  data.bundles.flatMap((b) => {
    const sum = b.skus.reduce((total, sku) => total + productOf(sku).price, 0)
    return [
      ...(new Set(b.skus).size >= 2 ? [] : [`${b.slug}: needs at least two distinct items`]),
      ...(b.price < sum ? [] : [`${b.slug}: price ${b.price} is not below the sum of its items ${sum}`]),
    ]
  }),
  'Invalid bundles',
)
fail(
  data.shippingZones.flatMap((z) => [
    ...z.municipalities.filter((m) => !SV_MUNICIPALITIES.includes(m)).map((m) => `${z.slug}: unknown municipality ${m}`),
    ...(z.coversRest && z.municipalities.length ? [`${z.slug}: the zone that covers the rest lists no municipalities`] : []),
  ]),
  'Invalid shipping zones',
)
fail(
  data.customers.flatMap((c) => [
    ...(SV_PHONE_REGEX.test(c.phone) ? [] : [`${c.email}: phone ${c.phone}`]),
    ...(c.email === c.email.trim().toLowerCase() ? [] : [`${c.email}: email must be lower case`]),
    ...(c.addresses.filter((a) => a.default).length === 1 ? [] : [`${c.email}: exactly one default address`]),
    ...c.addresses.flatMap((a) => [
      ...(isSvMunicipality(a.department, a.municipality) ? [] : [`${c.email}: ${a.municipality} is not in ${a.department}`]),
      ...(SV_PHONE_REGEX.test(a.phone) ? [] : [`${c.email}: address phone ${a.phone}`]),
    ]),
  ]),
  'Invalid customers',
)
const supplierOf = (sku: string) => {
  const brand = productOf(sku).brand
  const index = data.suppliers.findIndex((sp) => sp.brands.includes(brand))
  if (index < 0) throw new Error(`No supplier carries the brand of ${sku}`)
  return index + 1
}
for (const p of data.products) {
  bySlug(data.brands, p.brand)
  bySlug(data.categories, p.category)
  supplierOf(p.sku)
}

const pageFiles = readdirSync(join(dir, 'pages')).filter((f) => f.endsWith('.md'))
const pageSlugs = Object.keys(data.pages)
const fileSlugs = [...new Set(pageFiles.map((f) => f.split('.')[0]!))]
fail(
  [
    ...fileSlugs.filter((slug) => !pageSlugs.includes(slug)).map((slug) => `seed/pages/${slug}.*.md has no entry in catalog.json pages`),
    ...pageSlugs.flatMap((slug) => LOCALES.flatMap((l) => (pageFiles.includes(`${slug}.${l}.md`) ? [] : [`seed/pages/${slug}.${l}.md is missing`]))),
  ],
  'Invalid pages',
)
const page = (slug: string, locale: string) => {
  const content = readFileSync(join(dir, 'pages', `${slug}.${locale}.md`), 'utf8').trim()
  const [first, ...rest] = content.split('\n')
  if (!first?.startsWith('# ')) throw new Error(`${slug}.${locale}.md must start with "# Title"`)
  return { title: first.slice(2).trim(), body: rest.join('\n').trim() }
}

const unbacked = data.promises.find((p) => p.published && usesReturnWindow(LOCALES.map((l) => p[l])) && data.settings.returnWindowDays === null)
if (unbacked) throw new Error(`Promise ${unbacked.slug} quotes the return window but settings.returnWindowDays is null`)

const landing = readLanding(data.categories.map((c) => c.slug))
const s = data.settings
const whatsappNumber = s.whatsappNumber ? normalizePhone(s.whatsappNumber, s.countryCode).slice(1) : null

const pageVersion = (slug: string, locale: string) =>
  raw(`(SELECT v.id FROM page_versions v JOIN pages p ON p.id = v.page_id WHERE p.slug = ${lit(slug)} AND v.locale = ${lit(locale)} AND v.version = 1)`)
const demo = demoSql({
  products: data.products,
  bundles: data.bundles,
  zones: data.shippingZones,
  customers: data.customers,
  coupons,
  brands: data.brands,
  settings: { name: s.name, currency: s.currency, countryCode: s.countryCode, orderCodePrefix: s.orderCodePrefix, freeShippingFrom: s.freeShippingFrom, taxRateBp: s.taxRateBp },
  skuId,
  bundleId: (slug) => bySlug(data.bundles, slug),
  couponId: (code) => idOf(coupons, (c) => c.code, code),
  pageVersion: (slug) => pageVersion(slug, base),
  now: Date.now(),
})
// The opening stock covers what the demo orders sold, so each product ends with its stock.
const opening = (p: (typeof data.products)[number]) => p.stock + (demo.sold.get(p.sku) ?? 0)
const createdOf = (c: (typeof data.customers)[number], i: number) => {
  const first = demo.firstSeen.get(i + 1)
  return first !== undefined && first - 2 * 86_400_000 < Date.parse(c.createdAt) ? new Date(first - 2 * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z') : c.createdAt
}
const stocked = data.products.filter((p) => opening(p) > 0)
const openingOrders = data.suppliers.flatMap((_, i) => {
  const items = stocked.filter((p) => supplierOf(p.sku) === i + 1)
  return items.length ? [{ supplierId: i + 1, items }] : []
})
const pendingOrders = data.purchasing.pending.map((p) => ({ ...p, supplierId: supplierOf(p.sku) }))
const openingItems = openingOrders.flatMap((po, i) => po.items.map((p) => ({ purchaseOrderId: i + 1, product: p })))
const plusDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().replace('.000Z', 'Z')
const specId = (productIndex: number, position: number) => productIndex * 10 + position
const ids = (list: unknown[]) => list.map((_, i) => i + 1).join(', ')

const sql = [
  '-- Generated by seed/build.ts. Do not edit by hand.',
  insertMissing('store_settings', ['id'], [
    {
      id: 1,
      name: s.name,
      currency: s.currency,
      default_locale: s.defaultLocale,
      whatsapp_number: whatsappNumber,
      legal_name: s.legalName,
      tax_id_label: s.taxIdLabel,
      tax_id: s.taxId,
      address: s.address,
      phone: s.phone,
      email: s.email,
      time_zone: s.timeZone,
      country_code: s.countryCode,
      order_code_prefix: s.orderCodePrefix,
      max_quantity_per_line: s.maxQuantityPerLine,
      return_window_days: s.returnWindowDays,
      founding_year: s.foundingYear,
      free_shipping_from: s.freeShippingFrom,
      low_stock_threshold: s.lowStockThreshold,
      frequent_customer_min_orders: s.frequentCustomerMinOrders,
      inactive_customer_days: s.inactiveCustomerDays,
      followup_pending_payment_hours: s.followupPendingPaymentHours,
      followup_paid_unshipped_hours: s.followupPaidUnshippedHours,
      followup_shipped_undelivered_hours: s.followupShippedUndeliveredHours,
      tax_rate_bp: s.taxRateBp,
      bank_name: s.bankName,
      bank_account_type: s.bankAccountType,
      bank_account_number: s.bankAccountNumber,
      bank_account_holder: s.bankAccountHolder,
      discord_url: s.discordUrl,
      instagram_url: s.instagramUrl,
      tiktok_url: s.tiktokUrl,
      youtube_url: s.youtubeUrl,
    },
  ]),
  insertMissing('store_promises', ['id'], data.promises.map((p, i) => ({ id: i + 1, slug: p.slug, position: i, is_published: p.published }))),
  insertMissing('store_promise_translations', ['promise_id', 'locale'], data.promises.flatMap((p, i) => LOCALES.map((l) => ({ promise_id: i + 1, locale: l, title: p[l].title, body: p[l].body })))),
  insertMissing('shipping_zones', ['id'], data.shippingZones.map((z, i) => ({ id: i + 1, slug: z.slug, method: z.method, fee: z.fee, covers_rest: z.coversRest, delivery_days_min: z.deliveryDaysMin, delivery_days_max: z.deliveryDaysMax, position: i }))),
  insertMissing('shipping_zone_translations', ['zone_id', 'locale'], data.shippingZones.flatMap((z, i) => LOCALES.map((l) => ({ zone_id: i + 1, locale: l, name: z[l].name, description: z[l].description })))),
  insertMissing('shipping_zone_municipalities', ['municipality'], data.shippingZones.flatMap((z, i) => z.municipalities.map((municipality) => ({ municipality, zone_id: i + 1 })))),
  insertMissing('store_payment_methods', ['method'], data.paymentMethods.map((m, i) => ({ method: m.method, position: i + 1, max_total: m.maxTotal, shipping_zone_id: m.zone ? bySlug(data.shippingZones, m.zone) : null }))),
  insertMissing('brands', ['id'], data.brands.map((b, i) => ({ id: i + 1, slug: b.slug, name: b.name, search_key: searchKey(b.name, b.slug), country_code: b.countryCode }))),
  insertMissing('brand_translations', ['brand_id', 'locale'], data.brands.flatMap((b, i) => LOCALES.map((l) => ({ brand_id: i + 1, locale: l, description: b[l].description })))),
  insertMissing('categories', ['id'], data.categories.map((c, i) => ({ id: i + 1, slug: c.slug, sort_order: c.sortOrder, icon: c.icon }))),
  insertMissing(
    'category_translations',
    ['category_id', 'locale'],
    data.categories.flatMap((c, i) =>
      LOCALES.map((l) => {
        const t = landing.categories[c.slug]![l]!
        return { category_id: i + 1, locale: l, name: c[l].name, subtitle: c[l].subtitle, description: t.description, seo_title: t.seoTitle, seo_description: t.seoDescription }
      }),
    ),
  ),
  // Inserted as drafts: a product is published once it has a priced variant (trigger).
  insertMissing('products', ['id'], data.products.map((p, i) => ({ id: i + 1, slug: p.slug, brand_id: bySlug(data.brands, p.brand), category_id: bySlug(data.categories, p.category), status: 'draft', warranty_months: p.warrantyMonths, is_featured: p.featured, badge: p.badge ?? null }))),
  insertMissing('product_translations', ['product_id', 'locale'], data.products.flatMap((p, i) => LOCALES.map((l) => ({ product_id: i + 1, locale: l, name: p[l].name, search_key: searchKey(p[l].name), tagline: p[l].tagline, short_specs: p[l].shortSpecs, description: p[l].description })))),
  insertMissing('product_specs', ['id'], data.products.flatMap((p, i) => p[base].specs.map((_, n) => ({ id: specId(i, n + 1), product_id: i + 1, position: n + 1 })))),
  insertMissing('product_spec_translations', ['spec_id', 'locale'], data.products.flatMap((p, i) => LOCALES.flatMap((l) => p[l].specs.map(([label, value], n) => ({ spec_id: specId(i, n + 1), locale: l, label, value }))))),
  insertMissing('variants', ['id'], data.products.map((p, i) => ({ id: i + 1, product_id: i + 1, sku: p.sku, search_key: searchKey(p.sku), option_label: p.optionLabel, price: p.price }))),
  `UPDATE products SET status = 'published' WHERE status = 'draft' AND id IN (${ids(data.products)});`,
  insertMissing('bundles', ['id'], data.bundles.map((b, i) => ({ id: i + 1, slug: b.slug, status: 'draft', is_featured: b.featured, position: i, price: b.price }))),
  insertMissing('bundle_translations', ['bundle_id', 'locale'], data.bundles.flatMap((b, i) => LOCALES.map((l) => ({ bundle_id: i + 1, locale: l, name: b[l].name, description: b[l].description })))),
  insertMissing('bundle_items', ['bundle_id', 'variant_id'], data.bundles.flatMap((b, i) => b.skus.map((sku, n) => ({ bundle_id: i + 1, variant_id: skuId(sku), quantity: 1, position: n + 1 })))),
  ...data.bundles.flatMap((b, i) => (b.published ? [`UPDATE bundles SET status = 'published' WHERE status = 'draft' AND id = ${i + 1};`] : [])),
  insertMissing('collections', ['id'], collections.map((c, i) => ({ id: i + 1, slug: c.slug, status: 'published', position: i, show_on_home: c.showOnHome }))),
  insertMissing('collection_translations', ['collection_id', 'locale'], collections.flatMap((c, i) => LOCALES.map((l) => ({ collection_id: i + 1, locale: l, title: c[l].title, description: c[l].description })))),
  insertMissing('collection_products', ['collection_id', 'product_id'], collections.flatMap((c, i) => c.products.map((slug, n) => ({ collection_id: i + 1, product_id: bySlug(data.products, slug), position: n + 1 })))),
  insertMissing('suppliers', ['id'], data.suppliers.map((sp, i) => ({ id: i + 1, name: sp.name, contact_name: sp.contactName, search_key: searchKey(sp.name, sp.contactName), notes: sp.notes, lead_time_days: sp.leadTimeDays }))),
  insertMissing('supplier_items', ['supplier_id', 'variant_id'], data.products.map((p) => ({ supplier_id: supplierOf(p.sku), variant_id: skuId(p.sku), is_preferred: true }))),
  insertMissing('purchase_orders', ['id'], [
    ...openingOrders.map((po, i) => ({ id: i + 1, supplier_id: po.supplierId, reference: 'INVENTARIO-INICIAL', status: 'ordered', tax_included: true, ordered_on: data.purchasing.openingOrderedOn, notes: 'Inventario inicial de la tienda.' })),
    ...pendingOrders.map((po, i) => ({ id: openingOrders.length + i + 1, supplier_id: po.supplierId, reference: po.reference, status: 'ordered', tax_included: true, ordered_on: po.orderedOn, notes: null })),
  ]),
  insertMissing('purchase_order_items', ['id'], [
    ...openingItems.map((it, i) => ({ id: i + 1, purchase_order_id: it.purchaseOrderId, variant_id: skuId(it.product.sku), quantity: opening(it.product), unit_cost: it.product.cost })),
    ...pendingOrders.map((po, i) => ({ id: openingItems.length + i + 1, purchase_order_id: openingOrders.length + i + 1, variant_id: skuId(po.sku), quantity: po.quantity, unit_cost: productOf(po.sku).cost })),
  ]),
  insertMissing('purchase_receipts', ['id'], openingOrders.map((_, i) => ({ id: i + 1, purchase_order_id: i + 1, received_on: data.purchasing.openingReceivedOn, shipping_cost: 0, created_by: 'seed' }))),
  insertMissing('purchase_receipt_lines', ['id'], openingItems.map((it, i) => ({ id: i + 1, receipt_id: it.purchaseOrderId, purchase_order_item_id: i + 1, quantity: opening(it.product), allocated_shipping_e4: 0 }))),
  insertMissing('lots', ['id'], openingItems.map((it, i) => ({ id: i + 1, variant_id: skuId(it.product.sku), receipt_line_id: i + 1, unit_cost_e4: it.product.cost * 100 }))),
  insertMissing('inventory_movements', ['id'], openingItems.map((it, i) => ({ id: i + 1, lot_id: i + 1, kind: 'receive', quantity: opening(it.product), created_at: `${data.purchasing.openingReceivedOn}T16:00:00Z`, created_by: 'seed' }))),
  openingOrders.length ? `UPDATE purchase_orders SET status = 'received' WHERE status = 'ordered' AND id IN (${ids(openingOrders)});` : '',
  insertMissing('pages', ['id'], pageSlugs.map((slug, i) => ({ id: i + 1, slug, is_published: true, footer_position: data.pages[slug] }))),
  // Version 1 of every text: checkout consents point at the exact version shown.
  insertMissing('page_versions', ['page_id', 'locale', 'version'], pageSlugs.flatMap((slug, i) => LOCALES.map((l) => ({ page_id: i + 1, locale: l, version: 1, ...(({ title, body }) => ({ title, body_markdown: body }))(page(slug, l)) })))),
  insertMissing('customers', ['id'], data.customers.map((c, i) => ({ id: i + 1, name: c.name, phone_e164: c.phone, email: c.email, search_key: searchKey(c.name, c.email, phoneDigits(c.phone)), created_at: createdOf(c, i) }))),
  insertMissing(
    'customer_addresses',
    ['id'],
    data.customers
      .flatMap((c, i) => c.addresses.map((a) => ({ customer_id: i + 1, recipient_name: a.recipient, department: a.department, municipality: a.municipality, address_line: a.line, reference: a.reference, phone_e164: a.phone, is_default: a.default, created_at: createdOf(c, i), updated_at: createdOf(c, i) })))
      .map((a, n) => ({ id: n + 1, ...a })),
  ),
  insertMissing(
    'customer_consents',
    ['id'],
    data.customers
      .flatMap((c, i) =>
        ([['privacy_notice', true], ['terms', true], ...c.consents] as [string, boolean][]).map(([purpose, granted], n) => ({
          customer_id: i + 1,
          purpose,
          granted,
          page_version_id: pageVersion(purpose === 'terms' ? 'terms' : 'privacy', base),
          channel: 'web',
          recorded_at: plusDays(createdOf(c, i), Math.max(0, n - 1)),
        })),
      )
      .map((c, n) => ({ id: n + 1, ...c })),
  ),
  insertMissing('promotions', ['id'], coupons.map((c, i) => ({ id: i + 1, code: c.code, type: c.type, value: c.value, min_subtotal: c.minSubtotal, starts_on: c.startsOn, ends_on: c.endsOn, usage_limit: c.usageLimit, per_customer_limit: c.perCustomerLimit, first_order_only: c.firstOrderOnly, status: c.status }))),
  insertMissing('promotion_translations', ['promotion_id', 'locale'], coupons.flatMap((c, i) => LOCALES.map((l) => ({ promotion_id: i + 1, locale: l, description: c[l].description })))),
  demo.customersSql,
  ...demo.sql,
].join('\n')

writeFileSync(join(dir, 'seed.sql'), `${sql}\n`)
console.log(`seed.sql written: ${data.products.length} products, ${data.bundles.length} bundles, ${collections.length} collections, ${pageSlugs.length} pages, ${data.customers.length} customers, ${coupons.length} coupons; demo: ${demo.customers} more customers (${demo.reviewers} reviewers), ${demo.orders} orders, ${demo.reviews} reviews`)
