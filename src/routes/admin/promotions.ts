import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { Prisma, type PromotionDirection, type PromotionEligibility } from '@prisma/client'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { ApiError } from '../../lib/api-error.js'

export const promotionsRoute = new Hono<AppEnv>()

// ─── GET / — list all promotions, ordered by created date (desc) ─────────────
// Backs /admin/settings/promotions. The page partitions the response into
// active / scheduled / expired buckets client-side using `active`, `startsAt`,
// `endsAt`, so we ship every row in one round-trip.
promotionsRoute.get('/', async (c) => {
  const promotions = await db.conversionPromotion.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return c.json({
    ok: true,
    data: promotions.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      bonusPercent: p.bonusPercent.toString(),
      direction: p.direction,
      eligibility: p.eligibility,
      eligibleUserIds: p.eligibleUserIds,
      startsAt: p.startsAt.toISOString(),
      endsAt: p.endsAt.toISOString(),
      active: p.active,
      createdAt: p.createdAt.toISOString(),
    })),
  })
})

// ─── POST / — create a conversion promotion ──────────────────────────────────
const createPromotionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  bonusPercent: z.string().min(1),
  direction: z.enum(['FIAT_TO_KCRD', 'KCRD_TO_FIAT']),
  eligibility: z.enum(['ALL', 'FOUNDING_MEMBERS', 'RESIDENTS_ONLY', 'SPECIFIC_USERS']),
  eligibleUserIds: z.string().optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
})

promotionsRoute.post('/', zValidator('json', createPromotionSchema), async (c) => {
  const user = c.get('user')!
  const input = c.req.valid('json')

  let bonusDec: Prisma.Decimal
  try {
    bonusDec = new Prisma.Decimal(input.bonusPercent)
    if (bonusDec.lte(0) || bonusDec.gt(100)) {
      throw ApiError.validation('Bonus percent must be between 0 and 100.')
    }
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw ApiError.validation('Invalid bonus percent.')
  }

  const startsAtDate = new Date(input.startsAt)
  const endsAtDate = new Date(input.endsAt)
  if (endsAtDate <= startsAtDate) {
    throw ApiError.validation('End date must be after start date.')
  }

  const userIds = input.eligibleUserIds
    ? input.eligibleUserIds.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  const created = await db.conversionPromotion.create({
    data: {
      name: input.name,
      description: input.description,
      bonusPercent: bonusDec,
      direction: input.direction as PromotionDirection,
      eligibility: input.eligibility as PromotionEligibility,
      eligibleUserIds: userIds,
      startsAt: startsAtDate,
      endsAt: endsAtDate,
      active: true,
      createdBy: user.id,
    },
  })

  await db.auditLog.create({
    data: {
      action: 'promotion.created',
      entity: 'ConversionPromotion',
      actorId: user.id,
      after: {
        name: input.name,
        direction: input.direction,
        eligibility: input.eligibility,
        bonusPercent: input.bonusPercent,
      },
    },
  })

  return c.json({ ok: true, data: { promotionId: created.id } })
})

// ─── POST /:id/archive — deactivate + close out a promotion ──────────────────
promotionsRoute.post('/:id/archive', async (c) => {
  const user = c.get('user')!
  const id = c.req.param('id')

  await db.$transaction(async (tx) => {
    await tx.conversionPromotion.update({
      where: { id },
      data: { active: false, endsAt: new Date() },
    })
    await tx.auditLog.create({
      data: {
        action: 'promotion.archived',
        entity: 'ConversionPromotion',
        entityId: id,
        actorId: user.id,
      },
    })
  })

  return c.json({ ok: true, data: { promotionId: id } })
})
