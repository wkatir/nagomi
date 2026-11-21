import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LOCALES } from '../src/db/schema'

type PageText = { description: string; seoTitle: string; seoDescription: string }
type PerLocale = Record<string, PageText>
export type Landing = {
  concerns: Record<string, PerLocale>
  categories: Record<string, PerLocale>
  routines: Record<string, string>
}

// The same limits the admin forms enforce.
const LIMITS = { description: 1000, seoTitle: 70, seoDescription: 160 } as const

export function readLanding(known: { concerns: string[]; categories: string[]; routines: string[] }): Landing {
  const landing: Landing = JSON.parse(readFileSync(join(import.meta.dir, 'landing.json'), 'utf8'))

  const check = (kind: 'concerns' | 'categories') => {
    const entries = landing[kind]
    const slugs = known[kind]
    const unknown = Object.keys(entries).filter((s) => !slugs.includes(s))
    if (unknown.length) throw new Error(`seed/landing.json ${kind}: unknown ${unknown.join(', ')}`)
    for (const slug of slugs) {
      for (const locale of LOCALES) {
        const text = entries[slug]?.[locale]
        if (!text) throw new Error(`seed/landing.json ${kind}.${slug} has no ${locale} text`)
        for (const [field, max] of Object.entries(LIMITS)) {
          const value = text[field as keyof PageText]
          if (!value) throw new Error(`seed/landing.json ${kind}.${slug}.${locale}.${field} is empty`)
          if (value.length > max) throw new Error(`seed/landing.json ${kind}.${slug}.${locale}.${field} has ${value.length} characters, the limit is ${max}`)
        }
      }
    }
  }
  check('concerns')
  check('categories')

  for (const [routine, concern] of Object.entries(landing.routines)) {
    if (!known.routines.includes(routine)) throw new Error(`seed/landing.json routines: unknown routine ${routine}`)
    if (!known.concerns.includes(concern)) throw new Error(`seed/landing.json routines.${routine}: unknown need ${concern}`)
  }
  return landing
}
