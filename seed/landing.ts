import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LOCALES } from '../src/db/schema'

type PageText = { description: string; seoTitle: string; seoDescription: string }
type PerLocale = Record<string, PageText>
export type Landing = { categories: Record<string, PerLocale> }

const LIMITS = { description: 1000, seoTitle: 70, seoDescription: 160 } as const

export function readLanding(categories: string[]): Landing {
  const landing: Landing = JSON.parse(readFileSync(join(import.meta.dir, 'landing.json'), 'utf8'))
  const unknown = Object.keys(landing.categories).filter((s) => !categories.includes(s))
  if (unknown.length) throw new Error(`seed/landing.json categories: unknown ${unknown.join(', ')}`)
  for (const slug of categories) {
    for (const locale of LOCALES) {
      const text = landing.categories[slug]?.[locale]
      if (!text) throw new Error(`seed/landing.json categories.${slug} has no ${locale} text`)
      for (const [field, max] of Object.entries(LIMITS)) {
        const value = text[field as keyof PageText]
        if (!value) throw new Error(`seed/landing.json categories.${slug}.${locale}.${field} is empty`)
        if (value.length > max) throw new Error(`seed/landing.json categories.${slug}.${locale}.${field} has ${value.length} characters, the limit is ${max}`)
      }
    }
  }
  return landing
}
