import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { Prisma, type DisplayCurrency } from '@prisma/client'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { ApiError } from '../../lib/api-error.js'

export const ratesRoute = new Hono<AppEnv>()

// ─── POST / — set a new conversion rate ──────────────────────────────────────
// Closes any existing rate for the same (base, quote) pair by setting
// effectiveTo, then inserts the new rate. Atomic per pair.
const setRateSchema = z.object({
  baseCurrency: z.enum(['KCRD', 'USD', 'GYD']),
  quoteCurrency: z.enum(['KCRD', 'USD', 'GYD']),
  rate: z.string().min(1),
})

ratesRoute.post('/', zValidator('json', setRateSchema), async (c) => {
  const user = c.get('user')!
  const { baseCurrency, quoteCurrency, rate } = c.req.valid('json')

  if (baseCurrency === quoteCurrency) {
    throw ApiError.validation('Base and quote currency must differ.')
  }

  let rateDecimal: Prisma.Decimal
  try {
    rateDecimal = new Prisma.Decimal(rate)
    if (rateDecimal.lte(0)) {
      throw ApiError.validation('Rate must be greater than zero.')
    }
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw ApiError.validation('Invalid rate value.')
  }

  const now = new Date()

  await db.$transaction(async (tx) => {
    await tx.conversionRate.updateMany({
      where: {
        baseCurrency: baseCurrency as DisplayCurrency,
        quoteCurrency: quoteCurrency as DisplayCurrency,
        effectiveTo: null,
      },
      data: { effectiveTo: now },
    })
    await tx.conversionRate.create({
      data: {
        baseCurrency: baseCurrency as DisplayCurrency,
        quoteCurrency: quoteCurrency as DisplayCurrency,
        rate: rateDecimal,
        effectiveFrom: now,
        setBy: user.id,
      },
    })
    await tx.auditLog.create({
      data: {
        action: 'currency.rate.updated',
        entity: 'ConversionRate',
        actorId: user.id,
        after: { baseCurrency, quoteCurrency, rate },
      },
    })
  })

  return c.json({ ok: true, data: { baseCurrency, quoteCurrency, rate } })
})

// ─── GET /history?base=&quote= — last 10 rates for the pair ──────────────────
ratesRoute.get('/history', async (c) => {
  const base = c.req.query('base')
  const quote = c.req.query('quote')
  if (!base || !quote) {
    throw ApiError.validation('base and quote query params are required')
  }

  const rows = await db.conversionRate.findMany({
    where: {
      baseCurrency: base as DisplayCurrency,
      quoteCurrency: quote as DisplayCurrency,
    },
    orderBy: { effectiveFrom: 'desc' },
    take: 10,
    select: { rate: true, effectiveFrom: true, effectiveTo: true, setBy: true, id: true },
  })

  return c.json({ ok: true, data: rows })
})

// ─── GET /active — every rate currently in effect ────────────────────────────
ratesRoute.get('/active', async (c) => {
  const now = new Date()
  const rows = await db.conversionRate.findMany({
    where: {
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: [{ baseCurrency: 'asc' }, { quoteCurrency: 'asc' }],
  })

  return c.json({ ok: true, data: rows })
})
