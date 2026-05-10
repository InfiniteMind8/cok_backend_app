import type { DisplayCurrency } from '@prisma/client'
import { db } from '../db.js'

export type RatePair = {
  base: DisplayCurrency
  quote: DisplayCurrency
  rate: string // Decimal serialised as string for client-safety
}

export type RateMap = Record<string, string>

export async function getActiveRate(
  base: DisplayCurrency,
  quote: DisplayCurrency,
  at: Date = new Date(),
): Promise<string | null> {
  if (base === quote) return '1'
  const row = await db.conversionRate.findFirst({
    where: {
      baseCurrency: base,
      quoteCurrency: quote,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
    orderBy: { effectiveFrom: 'desc' },
    select: { rate: true },
  })
  return row ? row.rate.toString() : null
}

export async function getCurrentRates(): Promise<RateMap> {
  const now = new Date()
  const rows = await db.conversionRate.findMany({
    where: {
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    select: { baseCurrency: true, quoteCurrency: true, rate: true },
  })
  const map: RateMap = {}
  for (const row of rows) {
    map[`${row.baseCurrency}_${row.quoteCurrency}`] = row.rate.toString()
  }
  // KCRD↔KCRD is always 1
  map['KCRD_KCRD'] = '1'
  map['USD_USD'] = '1'
  map['GYD_GYD'] = '1'
  return map
}

export function rateKey(base: DisplayCurrency, quote: DisplayCurrency): string {
  return `${base}_${quote}`
}
