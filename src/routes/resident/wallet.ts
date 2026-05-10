import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { ApiError } from '../../lib/api-error.js'
import { requireRole } from '../../middleware/auth.js'
import { requestSettlement } from '../../lib/ledger/settlements.js'
import { getWalletBalance, getWalletSummary } from '../../lib/ledger/balance.js'
import { getRecentTransactions, getUserSettlementRequests } from '../../lib/queries/wallet.js'
import { getTransactionPage } from '../../lib/queries/wallet.js'

export const residentWalletRoute = new Hono<AppEnv>()

// ─── GET /summary — caller's wallet balance + per-bucket aggregates ──────────
residentWalletRoute.get('/summary', async (c) => {
  const user = c.get('user')!
  const wallet = await db.wallet.findUnique({ where: { userId: user.id } })
  if (!wallet) throw ApiError.notFound('Wallet not found')

  const summary = await getWalletSummary(wallet.id)
  return c.json({
    ok: true,
    data: {
      walletId: wallet.id,
      balance: summary.balance.toString(),
      totalDeposited: summary.totalDeposited.toString(),
      totalEarned: summary.totalEarned.toString(),
      totalEligibleForConversion: summary.totalEligibleForConversion.toString(),
    },
  })
})

// ─── GET /transactions/recent?limit= ─────────────────────────────────────────
residentWalletRoute.get(
  '/transactions/recent',
  requireRole('RESIDENT', 'VISITOR'),
  async (c) => {
    const user = c.get('user')!
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 10

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } })
    if (!wallet) throw ApiError.notFound('Wallet not found')

    const entries = await getRecentTransactions(wallet.id, limit)
    return c.json({ ok: true, data: { entries } })
  },
)

// ─── GET /settlements — caller's settlement request history ──────────────────
residentWalletRoute.get('/settlements', requireRole('RESIDENT'), async (c) => {
  const user = c.get('user')!
  const requests = await getUserSettlementRequests(user.id)
  return c.json({
    ok: true,
    data: requests.map((r) => ({
      ...r,
      amount: r.amount.toString(),
    })),
  })
})

// ─── POST /wallet/settlements — request a settlement ─────────────────────────
const requestSettlementSchema = z.object({
  amount: z.string().min(1),
  purpose: z.string().optional(),
})

residentWalletRoute.post(
  '/settlements',
  requireRole('RESIDENT'),
  zValidator('json', requestSettlementSchema),
  async (c) => {
    const user = c.get('user')!
    const { amount: amountInput, purpose } = c.req.valid('json')

    const parsedAmount = new Prisma.Decimal(amountInput)
    if (parsedAmount.lte(0)) throw ApiError.validation('Amount must be greater than zero')

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } })
    if (!wallet) throw ApiError.notFound('Wallet not found')

    const balance = await getWalletBalance(wallet.id)
    if (parsedAmount.gt(balance)) {
      throw ApiError.validation('Amount exceeds your current balance')
    }

    const created = await requestSettlement({
      userId: user.id,
      amount: parsedAmount,
      purpose: purpose?.trim() || undefined,
    })

    return c.json({ ok: true, data: { settlementId: created.id } })
  },
)

// ─── POST /wallet/settlements/:id/cancel ─────────────────────────────────────
residentWalletRoute.post('/settlements/:id/cancel', requireRole('RESIDENT'), async (c) => {
  const user = c.get('user')!
  const requestId = c.req.param('id')

  const request = await db.settlementRequest.findUnique({ where: { id: requestId } })
  if (!request) throw ApiError.notFound('Settlement request not found')
  if (request.userId !== user.id) throw ApiError.forbidden('Not authorised')
  if (request.status !== 'PENDING_APPROVAL') {
    throw ApiError.validation('Only pending requests can be cancelled')
  }

  await db.settlementRequest.update({
    where: { id: requestId },
    data: { status: 'CANCELLED' },
  })

  return c.json({ ok: true, data: { cancelled: true } })
})

// ─── GET /wallet/transactions?walletId=&cursor= ──────────────────────────────
// Cursor-paginated transaction history. The wallet must belong to the caller.
residentWalletRoute.get(
  '/transactions',
  requireRole('RESIDENT', 'VISITOR'),
  async (c) => {
    const user = c.get('user')!
    const walletId = c.req.query('walletId')
    const cursor = c.req.query('cursor')

    if (!walletId) throw ApiError.validation('walletId is required')

    const wallet = await db.wallet.findUnique({ where: { id: walletId } })
    if (!wallet || wallet.userId !== user.id) throw ApiError.forbidden('Not authorised')

    const page = await getTransactionPage(walletId, cursor)
    return c.json({ ok: true, data: page })
  },
)
