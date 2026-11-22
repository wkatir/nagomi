import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { allocateBundle, includedTax } from '../src/server/domain/cart-pricing'
import { confirmationMessage } from '../src/server/domain/confirmation'
import { newOrderCode } from '../src/server/domain/order-code'
import { phoneDigits, searchKey } from '../src/server/domain/search'
import { isSvMunicipality, SV_LOCATIONS } from '../src/lib/sv-locations'
import { insertMissing, lit } from './sql'

type Product = { sku: string; price: number; stock: number; category: string; brand: string; optionLabel: string | null; es: { name: string } }
type Bundle = { slug: string; price: number; skus: string[]; es: { name: string } }
type Zone = { slug: string; method: string; fee: number; deliveryDaysMin: number; deliveryDaysMax: number; coversRest: boolean; municipalities: string[]; es: { name: string } }
type DemoCustomer = { name: string; email: string; phone: string; addresses: { department: string; municipality: string; line: string; reference: string; default: boolean }[] }
type Coupon = { code: string; type: 'percentage' | 'fixed'; value: number; minSubtotal: number | null; startsOn: string | null; endsOn: string | null; perCustomerLimit: number | null; firstOrderOnly: boolean }

export type DemoInput = {
  products: Product[]
  bundles: Bundle[]
  zones: Zone[]
  customers: DemoCustomer[]
  coupons: Coupon[]
  brands: { slug: string; name: string }[]
  settings: { name: string; currency: string; countryCode: string; orderCodePrefix: string; freeShippingFrom: number; taxRateBp: number }
  skuId: (sku: string) => number
  bundleId: (slug: string) => number
  couponId: (code: string) => number
  pageVersion: (slug: string) => unknown
  now: number
}

type Reviews = {
  ratings: Record<string, [number, number]>
  firstNames: string[]
  lastNames: string[]
  texts: Record<'5' | '4' | '3', [string, string][]>
}

const H = 3_600_000
const D = 24 * H
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
const localDay = (ms: number) => new Date(ms - 6 * H).toISOString().slice(0, 10)
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * D).toISOString().slice(0, 10)

function prng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Status = 'D' | 'S' | 'P' | 'Pe' | 'C' | 'Cp'
type Method = 'card' | 'bank_transfer' | 'cash_on_delivery'
type Plan = {
  who: string
  status: Status
  // Days before the seed is built.
  age: number
  method: Method
  coupon?: string
  bundle?: string
  // Hours since the last step of an open order.
  since?: number
}

const PLANS: Plan[] = [
  { who: 'c7', status: 'D', age: 100, method: 'card' },
  { who: 'c1', status: 'D', age: 74, method: 'card' },
  { who: 'g1', status: 'D', age: 72, method: 'bank_transfer' },
  { who: 'c2', status: 'D', age: 70, method: 'cash_on_delivery' },
  { who: 'c3', status: 'D', age: 68, method: 'card' },
  { who: 'g2', status: 'D', age: 66, method: 'card', coupon: 'BIENVENIDA10' },
  { who: 'c1', status: 'D', age: 63, method: 'bank_transfer' },
  { who: 'c4', status: 'D', age: 60, method: 'card', coupon: 'BIENVENIDA10' },
  { who: 'g3', status: 'D', age: 58, method: 'cash_on_delivery' },
  { who: 'c2', status: 'D', age: 55, method: 'card', bundle: 'set-noche' },
  { who: 'c5', status: 'D', age: 52, method: 'bank_transfer' },
  { who: 'g4', status: 'C', age: 50, method: 'bank_transfer' },
  { who: 'c1', status: 'D', age: 48, method: 'card', coupon: 'SETUP15' },
  { who: 'g5', status: 'D', age: 45, method: 'card' },
  { who: 'c3', status: 'D', age: 42, method: 'card' },
  { who: 'c6', status: 'D', age: 40, method: 'bank_transfer', coupon: 'BIENVENIDA10' },
  { who: 'g6', status: 'D', age: 37, method: 'card', bundle: 'set-calma' },
  { who: 'c2', status: 'D', age: 34, method: 'bank_transfer' },
  { who: 'g7', status: 'Cp', age: 32, method: 'card' },
  { who: 'c4', status: 'D', age: 30, method: 'bank_transfer' },
  { who: 'c1', status: 'D', age: 27, method: 'card', bundle: 'set-sakura' },
  { who: 'g8', status: 'D', age: 25, method: 'bank_transfer' },
  { who: 'c5', status: 'D', age: 22, method: 'card', coupon: 'SETUP15' },
  { who: 'g9', status: 'D', age: 20, method: 'cash_on_delivery' },
  { who: 'c3', status: 'D', age: 17, method: 'card' },
  { who: 'g10', status: 'D', age: 15, method: 'bank_transfer' },
  { who: 'c2', status: 'D', age: 13, method: 'card' },
  { who: 'g11', status: 'C', age: 12, method: 'card' },
  { who: 'g4', status: 'D', age: 11, method: 'cash_on_delivery' },
  { who: 'g12', status: 'D', age: 10, method: 'bank_transfer', coupon: 'SETUP15' },
  { who: 'g5', status: 'C', age: 8, method: 'bank_transfer' },
  { who: 'c1', status: 'S', age: 7, method: 'card', since: 130 },
  { who: 'g13', status: 'S', age: 6, method: 'bank_transfer', since: 110 },
  { who: 'c5', status: 'S', age: 3, method: 'cash_on_delivery', since: 50 },
  { who: 'g1', status: 'S', age: 2, method: 'card', since: 26 },
  { who: 'c3', status: 'S', age: 2, method: 'bank_transfer', since: 20 },
  { who: 'c2', status: 'P', age: 3, method: 'bank_transfer', since: 60 },
  { who: 'g14', status: 'P', age: 1, method: 'card', since: 20 },
  { who: 'c1', status: 'P', age: 0.6, method: 'card', since: 12 },
  { who: 'g15', status: 'P', age: 0.9, method: 'bank_transfer', since: 6 },
  { who: 'c8', status: 'Pe', age: 4, method: 'bank_transfer' },
  { who: 'g16', status: 'Pe', age: 3, method: 'card' },
  { who: 'g2', status: 'Pe', age: 0.3, method: 'bank_transfer' },
  { who: 'c5', status: 'Pe', age: 0.2, method: 'card' },
  { who: 'c2', status: 'Pe', age: 2, method: 'cash_on_delivery' },
  { who: 'g3', status: 'Pe', age: 0.4, method: 'cash_on_delivery' },
]

const GUESTS: [string, string, string][] = [
  ['Roxana Elizabeth Pineda', 'San Salvador', 'San Salvador Oeste'],
  ['Marvin Josué Argueta', 'La Libertad', 'La Libertad Oeste'],
  ['Wendy Carolina Ayala', 'San Salvador', 'San Salvador Sur'],
  ['Edwin Alexander Molina', 'San Salvador', 'San Salvador Centro'],
  ['Karen Lissette Duarte', 'Usulután', 'Usulután Este'],
  ['Brenda Marisol Campos', 'Santa Ana', 'Santa Ana Centro'],
  ['Josué Ernesto Galdámez', 'Ahuachapán', 'Ahuachapán Centro'],
  ['Iris Yamileth Recinos', 'La Libertad', 'La Libertad Centro'],
  ['Fátima Beatriz Serrano', 'La Libertad', 'La Libertad Sur'],
  ['Óscar Armando Villalta', 'Chalatenango', 'Chalatenango Centro'],
  ['Silvia Marcela Lemus', 'San Miguel', 'San Miguel Centro'],
  ['Henry Mauricio Pérez', 'Sonsonate', 'Sonsonate Este'],
  ['Cindy Paola Arévalo', 'La Paz', 'La Paz Oeste'],
  ['Alexis Rodrigo Mendoza', 'San Salvador', 'San Salvador Norte'],
  ['Tania Lisbeth Rosales', 'Cuscatlán', 'Cuscatlán Norte'],
  ['Walter Enrique Saravia', 'Santa Ana', 'Santa Ana Norte'],
]

const STREETS = ['Colonia Miramonte, calle Los Sisimiles', 'Residencial Altavista, pasaje 12', 'Barrio El Centro, 4a avenida sur', 'Colonia Flor Blanca, 49 avenida sur', 'Urbanización Santa Elena, calle Cortez Blanco', 'Colonia San Benito, calle La Reforma', 'Residencial Las Margaritas, senda 3', 'Colonia Layco, 23 calle poniente']
const REFERENCES = ['Portón negro', 'Frente a la tienda', 'Casa de dos plantas', 'A la par de la farmacia', null, 'Esquina opuesta al parque']
const departmentOf = (municipality: string) => {
  const place = SV_LOCATIONS.find((l) => l.municipalities.includes(municipality))
  if (!place) throw new Error(`Unknown municipality ${municipality}`)
  return place.department
}
const ascii = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export function demoSql(input: DemoInput) {
  const reviews = JSON.parse(readFileSync(join(import.meta.dir, 'demo-reviews.json'), 'utf8')) as Reviews
  const rand = prng(20261121)
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)] as T
  const now = Math.floor(input.now / (60 * 1000)) * 60 * 1000
  const product = (sku: string) => {
    const p = input.products.find((x) => x.sku === sku)
    if (!p) throw new Error(`Unknown SKU ${sku}`)
    return p
  }
  const brandName = (slug: string) => {
    const brand = input.brands.find((b) => b.slug === slug)
    if (!brand) throw new Error(`Unknown brand ${slug}`)
    return brand.name
  }
  const zoneOf = (municipality: string) =>
    input.zones.find((z) => z.municipalities.includes(municipality)) ?? input.zones.find((z) => z.coversRest)!
  const sellable = input.products.filter((p) => p.stock > 0)
  const roomy = sellable.filter((p) => p.stock >= 5)

  type Person = { id: number; name: string; email: string; phone: string; department: string; municipality: string; line: string; reference: string | null; createdAt: number }
  const people = new Map<string, Person>()
  input.customers.forEach((c, i) => {
    const a = c.addresses.find((x) => x.default)
    if (!a) throw new Error(`${c.email} has no default address`)
    people.set(`c${i + 1}`, { id: i + 1, name: c.name, email: c.email, phone: c.phone, department: a.department, municipality: a.municipality, line: a.line, reference: a.reference, createdAt: 0 })
  })
  let nextCustomer = input.customers.length + 1
  const reviewerIds: string[] = []
  const usedPhones = new Set(input.customers.map((c) => c.phone))
  const phone = () => {
    for (;;) {
      const p = `+5037${String(Math.floor(rand() * 10_000_000)).padStart(7, '0')}`
      if (!usedPhones.has(p)) {
        usedPhones.add(p)
        return p
      }
    }
  }
  const places = input.zones.flatMap((z) => z.municipalities)
  for (let i = 0; i < 50; i++) {
    const first = reviews.firstNames[i % reviews.firstNames.length]!
    const last = reviews.lastNames[(i * 7) % reviews.lastNames.length]!
    const last2 = reviews.lastNames[(i * 11 + 3) % reviews.lastNames.length]!
    const name = `${first} ${last} ${last2}`
    const key = `r${i + 1}`
    const metro = rand() < 0.5
    const municipality = metro ? pick(places) : pick(['Santa Ana Centro', 'San Miguel Centro', 'Sonsonate Centro', 'La Paz Centro', 'Usulután Este'])
    const department = departmentOf(municipality)
    people.set(key, { id: nextCustomer++, name, email: `${ascii(first)}.${ascii(last)}.${i + 1}@demo.nagomi.example`, phone: phone(), department, municipality, line: pick(STREETS), reference: pick(REFERENCES), createdAt: 0 })
    reviewerIds.push(key)
  }
  GUESTS.forEach(([name, department, municipality], i) => {
    if (!isSvMunicipality(department, municipality)) throw new Error(`${municipality} is not in ${department}`)
    const [first, , last] = name.split(' ')
    if (!first || !last) throw new Error(`${name} needs a first name, a middle name and a last name`)
    people.set(`g${i + 1}`, { id: nextCustomer++, name, email: `${ascii(first)}.${ascii(last)}@correo.example`, phone: phone(), department, municipality, line: pick(STREETS), reference: pick(REFERENCES), createdAt: 0 })
  })

  const reviewPlan: { who: string; sku: string; rating: number }[] = []
  let cursor = 0
  for (const [sku, [average, count]] of Object.entries(reviews.ratings)) {
    const target = Math.round(average * count)
    const ratings = Array.from({ length: count }, () => 5)
    let deficit = 5 * count - target
    if (deficit >= 4 && count >= 10) {
      ratings[count - 1] = 3
      deficit -= 2
    }
    for (let k = 0; k < count && deficit > 0; k++) {
      if (ratings[k] === 5) {
        ratings[k] = 4
        deficit--
      }
    }
    for (let k = 0; k < count; k++) reviewPlan.push({ who: reviewerIds[(cursor + k) % reviewerIds.length]!, sku, rating: ratings[k]! })
    cursor += count
  }
  const reviewerOrders: Plan[] = reviewerIds.map((who, i) => ({ who, status: 'D', age: 95 + ((i * 37) % 70) + rand(), method: rand() < 0.6 ? 'card' : 'bank_transfer' }))
  let summer = 0
  const reviewerSubtotal = (who: string) =>
    reviewPlan.filter((r) => r.who === who).reduce((n, r) => n + product(r.sku).price, 0)
  for (const plan of reviewerOrders) {
    const day = localDay(now - plan.age * D)
    if (summer < 4 && day >= '2026-06-09' && day <= '2026-08-25' && reviewerSubtotal(plan.who) >= 5000) {
      plan.coupon = 'VERANO20'
      summer++
    }
  }

  type Line = { sku: string; quantity: number; unitPrice: number; bundle: string | null }
  const linesFor = (plan: Plan, reviewer: boolean): { lines: Line[]; sets: { slug: string; quantity: number }[] } => {
    if (reviewer) {
      const skus = reviewPlan.filter((r) => r.who === plan.who).map((r) => r.sku)
      return { lines: skus.map((sku) => ({ sku, quantity: 1, unitPrice: product(sku).price, bundle: null })), sets: [] }
    }
    const pool = plan.status === 'C' || plan.status === 'Cp' ? roomy : sellable
    for (let attempt = 0; attempt < 200; attempt++) {
      const lines: Line[] = []
      const sets: { slug: string; quantity: number }[] = []
      if (plan.bundle) {
        const b = input.bundles.find((x) => x.slug === plan.bundle)!
        const shares = allocateBundle(b.price, b.skus.map((sku) => ({ quantity: 1, listPrice: product(sku).price })))
        sets.push({ slug: b.slug, quantity: 1 })
        b.skus.forEach((sku, k) => lines.push({ sku, quantity: 1, unitPrice: shares[k]!, bundle: b.slug }))
      }
      const count = plan.bundle ? Math.floor(rand() * 2) : 1 + Math.floor(rand() * 3)
      for (let k = 0; k < count; k++) {
        const p = pick(pool)
        if (lines.some((l) => l.sku === p.sku && l.bundle === null)) continue
        lines.push({ sku: p.sku, quantity: rand() < 0.15 ? 2 : 1, unitPrice: p.price, bundle: null })
      }
      if (lines.length === 0) continue
      const subtotal = lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0)
      if (plan.method === 'cash_on_delivery' && subtotal > 14000) continue
      if (plan.coupon === 'SETUP15' && subtotal < 8000) continue
      return { lines, sets }
    }
    throw new Error(`No lines fit the plan of ${plan.who}`)
  }

  const all = [
    ...PLANS.map((p) => ({ plan: p, reviewer: false })),
    ...reviewerOrders.map((p) => ({ plan: p, reviewer: true })),
  ]
    .map((x) => ({ ...x, createdAt: now - Math.round(x.plan.age * D) + Math.round((rand() - 0.5) * 6 * H) }))
    .map((x) => ({ ...x, createdAt: Math.min(x.createdAt, now - 2 * H) }))
    .sort((a, b) => a.createdAt - b.createdAt)

  const sql: string[] = ['-- Demo data (seed/demo.ts): fictional customers, orders, payments and reviews for the reports.']
  const sold = new Map<string, number>()
  const firstSeen = new Map<number, number>()
  let itemId = 0
  let paymentId = 0
  let bundleRowId = 0
  let redemptionId = 0
  const codeRandom = prng(7)
  const deliveredOf = new Map<string, number>()
  const customerRows: Record<string, unknown>[] = []
  const created = new Set<string>()

  all.forEach(({ plan, reviewer, createdAt }, index) => {
    const orderId = index + 1
    const person = people.get(plan.who)!
    if (!created.has(plan.who) && !plan.who.startsWith('c')) {
      created.add(plan.who)
      customerRows.push({ id: person.id, name: person.name, email: person.email, phone_e164: person.phone, search_key: searchKey(person.name, person.email, phoneDigits(person.phone)), created_at: iso(createdAt - 5 * 60 * 1000) })
    }
    firstSeen.set(person.id, Math.min(firstSeen.get(person.id) ?? Number.POSITIVE_INFINITY, createdAt))
    const zone = zoneOf(person.municipality)
    const method: Method = plan.method === 'cash_on_delivery' && zone.slug !== 'metro' ? 'card' : plan.method
    const { lines, sets } = linesFor(plan, reviewer)
    const subtotal = lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0)
    const coupon = plan.coupon ? input.coupons.find((c) => c.code === plan.coupon)! : null
    const discount = coupon ? (coupon.type === 'percentage' ? Math.floor((subtotal * coupon.value + 50) / 100) : Math.min(coupon.value, subtotal)) : 0
    if (coupon?.minSubtotal && subtotal < coupon.minSubtotal) throw new Error(`Coupon ${coupon.code} below its minimum`)
    const merchandise = subtotal - discount
    const shipping = merchandise >= input.settings.freeShippingFrom ? 0 : zone.fee
    const total = merchandise + shipping
    const code = newOrderCode(input.settings.orderCodePrefix, (n) => Uint8Array.from({ length: n }, () => Math.floor(codeRandom() * 256)))
    const day = localDay(createdAt)
    const estimate = { from: addDays(day, zone.deliveryDaysMin), to: addDays(day, zone.deliveryDaysMax) }
    const itemsText = lines.map((l) => {
      const p = product(l.sku)
      return { quantity: l.quantity, unitPrice: l.unitPrice, brandName: brandName(p.brand), productName: p.es.name, optionLabel: p.optionLabel }
    })
    const message = confirmationMessage({
      storeName: input.settings.name,
      code,
      locale: 'es',
      countryCode: input.settings.countryCode,
      currency: input.settings.currency,
      lines: itemsText,
      subtotal,
      discount,
      discountReason: coupon?.code ?? null,
      shipping,
      shippingMethod: zone.method as 'own_delivery' | 'courier',
      zoneName: zone.es.name,
      total,
      paymentMethod: method,
      delivery: estimate,
    })
    sql.push(
      insertMissing('orders', ['id'], [
        {
          id: orderId,
          code,
          idempotency_key: `demo-${orderId}`,
          request_hash: 'demo',
          customer_id: person.id,
          customer_name: person.name,
          customer_email: person.email,
          customer_phone: person.phone,
          search_key: searchKey(code, person.name, person.email, phoneDigits(person.phone)),
          locale: 'es',
          channel: 'web',
          status: 'pending',
          payment_method: method,
          subtotal,
          discount,
          discount_reason: coupon?.code ?? null,
          shipping,
          total,
          tax_included: includedTax(total, input.settings.taxRateBp),
          shipping_method: zone.method,
          shipping_zone_id: input.zones.indexOf(zone) + 1,
          shipping_zone_name: zone.es.name,
          ship_department: person.department,
          ship_municipality: person.municipality,
          ship_address_line: person.line,
          ship_reference: person.reference,
          delivery_estimate_from: estimate.from,
          delivery_estimate_to: estimate.to,
          confirmation_message: message,
          created_at: iso(createdAt),
          promotion_id: coupon ? input.couponId(coupon.code) : null,
        },
      ]),
    )
    for (const s of sets) {
      bundleRowId++
      const b = input.bundles.find((x) => x.slug === s.slug)!
      sql.push(insertMissing('order_bundles', ['id'], [{ id: bundleRowId, order_id: orderId, bundle_id: input.bundleId(s.slug), quantity: s.quantity, unit_price: b.price, name: b.es.name }]))
    }
    const setRow = new Map(sets.map((s, k) => [s.slug, bundleRowId - sets.length + k + 1]))
    for (const l of lines) {
      itemId++
      const p = product(l.sku)
      sql.push(
        insertMissing('order_items', ['id'], [
          { id: itemId, order_id: orderId, variant_id: input.skuId(l.sku), order_bundle_id: l.bundle ? setRow.get(l.bundle)! : null, quantity: l.quantity, unit_price: l.unitPrice, sku: l.sku, brand_name: brandName(p.brand), product_name: p.es.name, option_label: p.optionLabel },
        ]),
        `INSERT INTO inventory_movements (lot_id, kind, quantity, order_item_id, created_at, created_by) SELECT (SELECT id FROM lots WHERE variant_id = ${input.skuId(l.sku)} ORDER BY id LIMIT 1), 'sale', ${-l.quantity}, ${itemId}, ${lit(iso(createdAt))}, 'seed' WHERE NOT EXISTS (SELECT 1 FROM inventory_movements WHERE order_item_id = ${itemId} AND kind = 'sale');`,
      )
      if (plan.status !== 'C' && plan.status !== 'Cp') sold.set(l.sku, (sold.get(l.sku) ?? 0) + l.quantity)
    }
    if (coupon) {
      redemptionId++
      sql.push(insertMissing('promotion_redemptions', ['id'], [{ id: redemptionId, promotion_id: input.couponId(coupon.code), order_id: orderId, email: person.email, customer_key: coupon.perCustomerLimit ? person.email : null, created_at: iso(createdAt) }]))
    }
    const marketing = rand() < 0.4
    sql.push(
      insertMissing('customer_consents', ['order_id', 'purpose'], [
        { customer_id: person.id, order_id: orderId, purpose: 'privacy_notice', granted: true, page_version_id: input.pageVersion('privacy'), channel: 'web', recorded_at: iso(createdAt) },
        { customer_id: person.id, order_id: orderId, purpose: 'terms', granted: true, page_version_id: input.pageVersion('terms'), channel: 'web', recorded_at: iso(createdAt) },
        { customer_id: person.id, order_id: orderId, purpose: 'marketing_email', granted: marketing, page_version_id: input.pageVersion('privacy'), channel: 'web', recorded_at: iso(createdAt) },
        { customer_id: person.id, order_id: orderId, purpose: 'marketing_whatsapp', granted: false, page_version_id: input.pageVersion('privacy'), channel: 'web', recorded_at: iso(createdAt) },
      ]),
    )

    const pay = (at: number, payMethod: Method) => {
      paymentId++
      const tx = payMethod === 'card' ? `demo-${code.toLowerCase()}` : null
      sql.push(
        insertMissing('payments', ['id'], [
          { id: paymentId, order_id: orderId, kind: 'payment', method: payMethod, amount: total, status: 'confirmed', reference: payMethod === 'card' ? `wompi:${tx} (demo)` : payMethod === 'bank_transfer' ? `TRF-${String(100000 + orderId * 37).slice(-6)}` : 'Cobrado por el repartidor', provider_transaction_id: tx, recorded_at: iso(at), recorded_by: 'seed' },
        ]),
      )
    }
    const update = (from: string, set: Record<string, unknown>) =>
      sql.push(`UPDATE orders SET ${Object.entries(set).map(([k, v]) => `${k} = ${lit(v)}`).join(', ')} WHERE id = ${orderId} AND status = ${lit(from)};`)
    const courier = zone.method === 'own_delivery' ? 'Reparto Nagomi' : pick(['C807 Xpress', 'Correos de El Salvador', 'Urbano Express'])
    const tracking = zone.method === 'own_delivery' ? null : `SV${String(Math.floor(rand() * 1e9)).padStart(9, '0')}`
    const at = (ms: number) => Math.min(ms, now - 30 * 60 * 1000)

    const cod = method === 'cash_on_delivery'
    const payDelay = method === 'card' ? (2 + rand() * 20) * 60 * 1000 : (2 + rand() * 30) * H
    const status = plan.status
    if (status === 'C') {
      const cancelledAt = at(createdAt + (method === 'card' ? 49 : 50 + rand() * 30) * H)
      update('pending', { status: 'cancelled', cancelled_at: iso(cancelledAt), cancelled_by: 'seed', cancel_reason: method === 'card' ? 'payment_deadline' : 'El cliente desistió antes de pagar' })
      return
    }
    if (status === 'Pe') return
    let paidAt: number | null = null
    if (!cod) {
      paidAt = status === 'P' && plan.since !== undefined ? Math.max(createdAt + 10 * 60 * 1000, now - plan.since * H) : at(createdAt + payDelay)
      pay(paidAt, method)
      update('pending', { status: 'paid', paid_at: iso(paidAt) })
    }
    if (status === 'Cp') {
      const cancelledAt = at((paidAt ?? createdAt) + 6 * H)
      update('paid', { status: 'cancelled', cancelled_at: iso(cancelledAt), cancelled_by: 'seed', cancel_reason: 'El cliente pidió cancelar antes del envío' })
      paymentId++
      sql.push(insertMissing('payments', ['id'], [{ id: paymentId, order_id: orderId, kind: 'refund', method, amount: total, status: 'confirmed', reference: 'Reembolso por cancelación', recorded_at: iso(cancelledAt + H), recorded_by: 'seed' }]))
      return
    }
    if (status === 'P') return
    const shippedAt = status === 'S' && plan.since !== undefined ? Math.max((paidAt ?? createdAt) + 30 * 60 * 1000, now - plan.since * H) : at((paidAt ?? createdAt) + (2 + rand() * 18) * H)
    update(cod ? 'pending' : 'paid', { status: 'shipped', shipped_at: iso(shippedAt), courier, tracking_code: tracking })
    if (status === 'S') return
    const deliveredAt = at(shippedAt + (zone.method === 'own_delivery' ? 18 + rand() * 30 : 40 + rand() * 50) * H)
    if (cod) pay(deliveredAt - 10 * 60 * 1000, 'cash_on_delivery')
    update('shipped', { status: 'delivered', delivered_at: iso(deliveredAt) })
    deliveredOf.set(plan.who, deliveredAt)
  })

  const reviewRows = reviewPlan.map((r, i) => {
    const pool = reviews.texts[String(Math.min(5, Math.max(3, r.rating))) as '5' | '4' | '3']
    const productIndex = Object.keys(reviews.ratings).indexOf(r.sku)
    const [title, body] = pool[(i * 7 + productIndex * 3) % pool.length]!
    const delivered = deliveredOf.get(r.who)
    if (delivered === undefined) throw new Error(`Reviewer ${r.who} has no delivered order`)
    const createdAt = Math.min(delivered + (1 + rand() * 12) * D, now - H)
    return {
      product_id: input.skuId(r.sku),
      customer_id: people.get(r.who)!.id,
      rating: r.rating,
      title,
      body,
      status: 'approved',
      created_at: iso(createdAt),
      updated_at: iso(createdAt),
      moderated_at: iso(createdAt + 3 * H),
    }
  })
  const pendingReviews = [
    { who: 'c1', rating: 5, title: 'Me encantó', body: 'Ya es mi segundo pedido y todo llega rapidísimo. Muy contenta con la calidad.' },
    { who: 'c2', rating: 4, title: 'Buen producto', body: 'Funciona muy bien. El repartidor llegó a la hora indicada.' },
    { who: 'c3', rating: 2, title: 'Esperaba más', body: 'El envío a Santa Ana tardó más de lo esperado y la caja venía golpeada.' },
  ]

  const customersSql = insertMissing('customers', ['id'], customerRows)
  return {
    customersSql,
    sql: [
      ...sql,
      insertMissing('product_reviews', ['customer_id', 'product_id'], reviewRows),
      ...pendingReviews.map((r) => {
        const person = people.get(r.who)!
        return `INSERT INTO product_reviews (product_id, customer_id, rating, title, body, status, created_at, updated_at) SELECT v.product_id, ${person.id}, ${r.rating}, ${lit(r.title)}, ${lit(r.body)}, 'pending', ${lit(iso(now - 20 * H))}, ${lit(iso(now - 20 * H))} FROM order_items i JOIN orders o ON o.id = i.order_id JOIN variants v ON v.id = i.variant_id WHERE o.customer_id = ${person.id} AND o.status = 'delivered' AND NOT EXISTS (SELECT 1 FROM product_reviews WHERE customer_id = ${person.id}) ORDER BY o.id, i.id LIMIT 1;`
      }),
      insertMissing('stock_alerts', ['variant_id', 'email'], [
        { variant_id: input.skuId('RAT-003'), email: 'mariajose.hernandez@example.com', created_at: iso(now - 9 * D) },
        { variant_id: input.skuId('RAT-003'), email: 'fernando.aguilar@correo.example', created_at: iso(now - 4 * D) },
        { variant_id: input.skuId('RAT-003'), email: 'sofia.portillo@correo.example', created_at: iso(now - 30 * H) },
      ]),
      insertMissing('wishlist_items', ['customer_id', 'product_id'], [
        { customer_id: 1, product_id: input.skuId('AUD-001'), created_at: iso(now - 6 * D) },
        { customer_id: 1, product_id: input.skuId('ILU-002'), created_at: iso(now - 3 * D) },
        { customer_id: 2, product_id: input.skuId('TEC-003'), created_at: iso(now - 2 * D) },
      ]),
    ],
    sold,
    firstSeen,
    reviewers: reviewerIds.length,
    orders: all.length,
    reviews: reviewRows.length + pendingReviews.length,
    customers: customerRows.length,
  }
}

