import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { ApiError } from '../../lib/api-error.js'
import { createAuditEntry } from '../../lib/audit/index.js'
import {
  getSystemWalletSummary,
  getTreasuryReserveBalance,
} from '../../lib/queries/dashboard.js'
import { getAllWalletRows } from '../../lib/ledger/balance.js'
import { reconcileTreasury } from '../../lib/ledger/reconciliation.js'

export const treasuryRoute = new Hono<AppEnv>()

// ─── GET /debug — diagnostic wallet rows + reconciliation snapshot ───────────
treasuryRoute.get('/debug', async (c) => {
  const [wallets, recon] = await Promise.all([getAllWalletRows(), reconcileTreasury()])
  return c.json({
    ok: true,
    data: {
      wallets: wallets.map((w) => ({
        walletId: w.walletId,
        userId: w.userId,
        systemKey: w.systemKey,
        isSystem: w.isSystem,
        balance: w.balance.toString(),
        displayName: w.displayName,
      })),
      reconciliation: {
        isBalanced: recon.isBalanced,
        totalIssued: recon.totalIssued.toString(),
        sumAllEntries: recon.sumAllEntries.toString(),
        discrepancy: recon.discrepancy.toString(),
      },
    },
  })
})

// ─── GET / — treasury overview ───────────────────────────────────────────────
// Page bundle for /admin/treasury: reserve balance, system wallet floors,
// active-user select list (for the deposit sheet), approved-and-not-yet-
// settled requests (for the execute sheet), and a paginated deposit log.
treasuryRoute.get('/', async (c) => {
  const depositsPage = c.req.query('depositsPage')
    ? Math.max(1, parseInt(c.req.query('depositsPage')!, 10) || 1)
    : 1
  const pageSize = 20
  const skip = (depositsPage - 1) * pageSize

  const [reserveBalance, systemWallets, allUsers, deposits, depositTotal, approvedSettlements] =
    await Promise.all([
      getTreasuryReserveBalance(),
      getSystemWalletSummary(),
      db.user.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, fullName: true, email: true, memberId: true },
        orderBy: { fullName: 'asc' },
      }),
      db.deposit.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      db.deposit.count(),
      db.settlementRequest.findMany({
        where: { status: 'APPROVED' },
        orderBy: { approvedAt: 'asc' },
      }),
    ])

  const depositsWithMeta = await Promise.all(
    deposits.map(async (d) => {
      const user = await db.user.findUnique({
        where: { id: d.userId },
        select: { fullName: true, memberId: true },
      })
      const tx = await db.transaction.findUnique({
        where: { id: d.transactionId },
        include: {
          entries: {
            where: { walletId: { not: '' }, amount: { gt: 0 } },
            take: 1,
          },
        },
      })
      const kIssued = tx?.entries[0]?.amount ?? new Prisma.Decimal(0)

      return {
        id: d.id,
        createdAt: d.createdAt.toISOString(),
        userId: d.userId,
        userName: user?.fullName ?? 'Unknown',
        memberId: user?.memberId ?? '—',
        fiatAmount: new Prisma.Decimal(d.fiatAmount).toFixed(2),
        currency: d.currency,
        paymentMethod: d.paymentMethod,
        proofUrl: d.proofUrl,
        kIssued: new Prisma.Decimal(kIssued).toFixed(2),
      }
    }),
  )

  const approvedWithUser = await Promise.all(
    approvedSettlements.map(async (s) => {
      const user = await db.user.findUnique({
        where: { id: s.userId },
        select: { fullName: true, memberId: true },
      })
      return {
        id: s.id,
        userId: s.userId,
        amount: new Prisma.Decimal(s.amount).toFixed(2),
        userName: user?.fullName ?? 'Unknown',
        memberId: user?.memberId ?? '—',
        approvedAt: s.approvedAt ? s.approvedAt.toISOString() : null,
      }
    }),
  )

  return c.json({
    ok: true,
    data: {
      reserveBalance: reserveBalance.toFixed(2),
      systemWallets: systemWallets.map((w) => ({
        walletId: w.walletId,
        key: w.key,
        balance: w.balance.toFixed(2),
        floor: w.floor !== null ? w.floor.toFixed(2) : null,
        headroom: w.headroom !== null ? w.headroom.toFixed(2) : null,
      })),
      allUsers,
      deposits: depositsWithMeta,
      depositTotal,
      approvedSettlements: approvedWithUser,
    },
  })
})

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
