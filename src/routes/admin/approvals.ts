import { Hono } from 'hono'
import { Prisma } from '@prisma/client'
import { differenceInDays } from 'date-fns'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { getWalletBalance } from '../../lib/ledger/balance.js'

export const approvalsRoute = new Hono<AppEnv>()

// ─── GET / — counts only ─────────────────────────────────────────────────────
// Lightweight aggregate for the Approvals page tab badges. The per-tab
// arrays are fetched lazily via the dedicated endpoints below.
approvalsRoute.get('/', async (c) => {
  const [settlements, transfers, vouchers, extensions] = await Promise.all([
    db.settlementRequest.count({ where: { status: 'PENDING_APPROVAL' } }),
    db.propertyTransferRequest.count({ where: { status: 'PENDING' } }),
    db.voucherRequest.count({ where: { status: 'PENDING' } }),
    db.rentalExtensionRequest.count({ where: { status: 'PENDING' } }),
  ])

  return c.json({
    ok: true,
    data: { counts: { settlements, transfers, vouchers, extensions } },
  })
})

// ─── GET /settlements — pending settlement requests ──────────────────────────
approvalsRoute.get('/settlements', async (c) => {
  const requests = await db.settlementRequest.findMany({
    where: { status: 'PENDING_APPROVAL' },
    orderBy: { createdAt: 'asc' },
  })

  const rows = await Promise.all(
    requests.map(async (r) => {
      const user = await db.user.findUnique({
        where: { id: r.userId },
        select: { fullName: true, memberId: true },
      })
      const wallet = await db.wallet.findUnique({ where: { userId: r.userId } })
      const eligibleBalance = wallet ? await getWalletBalance(wallet.id) : new Prisma.Decimal(0)

      return {
        id: r.id,
        userId: r.userId,
        amount: new Prisma.Decimal(r.amount).toFixed(2),
        purpose: r.purpose,
        createdAt: r.createdAt.toISOString(),
        userName: user?.fullName ?? 'Unknown',
        memberId: user?.memberId ?? '—',
        eligibleBalance: eligibleBalance.toFixed(2),
      }
    }),
  )

  return c.json({ ok: true, data: rows })
})

// ─── GET /property-transfers — pending property transfers ────────────────────
approvalsRoute.get('/property-transfers', async (c) => {
  const requests = await db.propertyTransferRequest.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    include: { property: { select: { code: true, address: true } } },
  })

  const rows = await Promise.all(
    requests.map(async (r) => {
      const [fromUser, toUser] = await Promise.all([
        db.user.findUnique({
          where: { id: r.fromUserId },
          select: { fullName: true, memberId: true },
        }),
        db.user.findUnique({
          where: { id: r.toUserId },
          select: { fullName: true, memberId: true },
        }),
      ])
      return {
        id: r.id,
        propertyCode: r.property.code,
        propertyAddress: r.property.address,
        fromUser: fromUser ?? { fullName: 'Unknown', memberId: '—' },
        toUser: toUser ?? { fullName: 'Unknown', memberId: '—' },
        createdAt: r.createdAt.toISOString(),
      }
    }),
  )

  return c.json({ ok: true, data: rows })
})

// ─── GET /voucher-requests — pending voucher requests ────────────────────────
approvalsRoute.get('/voucher-requests', async (c) => {
  const requests = await db.voucherRequest.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
  })

  const rows = await Promise.all(
    requests.map(async (r) => {
      const recipient = await db.user.findUnique({
        where: { id: r.recipientId },
        select: { fullName: true, memberId: true },
      })
      return {
        id: r.id,
        amount: new Prisma.Decimal(r.amountKcrd).toFixed(2),
        description: r.description ?? r.message ?? null,
        expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        recipient: recipient ?? { fullName: 'Unknown', memberId: '—' },
      }
    }),
  )

  return c.json({ ok: true, data: rows })
})

// ─── GET /rental-extensions — pending rental extension requests ──────────────
approvalsRoute.get('/rental-extensions', async (c) => {
  const requests = await db.rentalExtensionRequest.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    include: {
      tenancy: {
        include: { property: { select: { code: true, address: true } } },
      },
      requestedBy: { select: { fullName: true, memberId: true } },
    },
  })

  const rows = requests.map((r) => {
    const currentEnd = r.tenancy.endDate
    const requestedEnd = r.requestedNewEndDate
    const deltaDays = currentEnd ? differenceInDays(requestedEnd, currentEnd) : 0

    return {
      id: r.id,
      requesterName: r.requestedBy.fullName,
      requesterMemberId: r.requestedBy.memberId,
      propertyCode: r.tenancy.property.code,
      propertyAddress: r.tenancy.property.address,
      currentEnd: currentEnd ? currentEnd.toISOString() : null,
      requestedEnd: requestedEnd.toISOString(),
      deltaDays,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    }
  })

  return c.json({ ok: true, data: rows })
})
