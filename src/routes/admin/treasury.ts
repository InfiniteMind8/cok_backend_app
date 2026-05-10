import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { ApiError } from '../../lib/api-error.js'
import { createAuditEntry } from '../../lib/audit/index.js'

export const treasuryRoute = new Hono<AppEnv>()

// ─── POST /adjustments — record a manual treasury adjustment ─────────────────
const adjustmentSchema = z.object({
  amount: z.string().min(1),
  currency: z.string().min(1),
  reason: z.string().min(1, 'Reason is required'),
})

treasuryRoute.post('/adjustments', zValidator('json', adjustmentSchema), async (c) => {
  const admin = c.get('user')!
  const input = c.req.valid('json')

  const amount = parseFloat(input.amount)
  if (isNaN(amount) || amount === 0) {
    throw ApiError.validation('Amount must be a non-zero number')
  }

  const created = await db.treasuryAdjustment.create({
    data: {
      amount: input.amount,
      currency: input.currency,
      reason: input.reason.trim(),
      recordedBy: admin.id,
    },
  })

  return c.json({ ok: true, data: { adjustmentId: created.id } })
})

// ─── POST /wallets/:walletId/floor — set/clear a system wallet floor ─────────
// `floor: null` clears the floor (unlimited withdrawal); a numeric string sets
// a minimum balance the wallet must hold after any outbound transfer.
const walletFloorSchema = z.object({
  floor: z.string().nullable(),
})

treasuryRoute.post(
  '/wallets/:walletId/floor',
  zValidator('json', walletFloorSchema),
  async (c) => {
    const admin = c.get('user')!
    const walletId = c.req.param('walletId')
    const { floor: floorInput } = c.req.valid('json')

    if (floorInput !== null) {
      const parsed = new Prisma.Decimal(floorInput)
      if (parsed.lt(0)) {
        throw ApiError.validation(
          'Floor must be zero or a positive value, or null for unlimited.',
        )
      }
    }

    const wallet = await db.wallet.findUnique({
      where: { id: walletId },
      select: { id: true, isSystem: true, systemKey: true, floor_kcrd: true },
    })
    if (!wallet) throw ApiError.notFound(`Wallet not found: ${walletId}`)
    if (!wallet.isSystem) {
      throw ApiError.validation('Floor protection applies to system wallets only.')
    }

    const newFloor = floorInput !== null ? new Prisma.Decimal(floorInput) : null

    await db.wallet.update({
      where: { id: walletId },
      data: { floor_kcrd: newFloor },
    })

    await createAuditEntry({
      action: 'wallet.floor.updated',
      entity: 'Wallet',
      entityId: walletId,
      actorId: admin.id,
      before: { floor_kcrd: wallet.floor_kcrd?.toString() ?? null },
      after: { floor_kcrd: newFloor?.toString() ?? null, systemKey: wallet.systemKey },
    })

    return c.json({
      ok: true,
      data: { walletId, floor: newFloor?.toString() ?? null },
    })
  },
)
