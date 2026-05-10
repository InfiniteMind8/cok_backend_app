import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { AppEnv } from '../../server.js'
import { recordDeposit } from '../../lib/ledger/deposits.js'

export const depositsRoute = new Hono<AppEnv>()

const recordDepositSchema = z.object({
  userId: z.string().min(1),
  fiatAmount: z.string().min(1),
  currency: z.string().optional(),
  paymentMethod: z.string().min(1),
  proofUrl: z.string().optional(),
  notes: z.string().optional(),
})

// ─── POST / — record a fiat deposit ──────────────────────────────────────────
// Inherits MASTER_ADMIN gate from the parent admin router. recordDeposit()
// runs the double-entry transaction (user wallet credit + treasury_reserve
// debit) and the lib helper performs the dev-mode reconciliation check.
depositsRoute.post('/', zValidator('json', recordDepositSchema), async (c) => {
  const admin = c.get('user')!
  const input = c.req.valid('json')

  const { transactionId, kAmount } = await recordDeposit({
    userId: input.userId,
    fiatAmount: input.fiatAmount,
    currency: input.currency,
    paymentMethod: input.paymentMethod,
    proofUrl: input.proofUrl,
    recordedBy: admin.id,
  })

  return c.json({
    ok: true,
    data: { transactionId, kcrdAmount: kAmount.toFixed(8) },
  })
})
