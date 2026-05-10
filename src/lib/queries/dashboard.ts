import { Prisma, type Role } from '@prisma/client'
import { db } from '../db.js'
import { getWalletBalance } from '../ledger/balance.js'

export async function getTreasuryReserveBalance(): Promise<Prisma.Decimal> {
  const wallet = await db.wallet.findUnique({ where: { systemKey: 'treasury_reserve' } })
  if (!wallet) return new Prisma.Decimal(0)
  return getWalletBalance(wallet.id)
}

export async function getCommunityFundBalance(): Promise<Prisma.Decimal> {
  const wallet = await db.wallet.findUnique({ where: { systemKey: 'community_fund' } })
  if (!wallet) return new Prisma.Decimal(0)
  return getWalletBalance(wallet.id)
}

export interface SystemWalletSummaryRow {
  walletId: string
  key: string
  balance: Prisma.Decimal
  floor: Prisma.Decimal | null
  headroom: Prisma.Decimal | null
}

export async function getSystemWalletSummary(): Promise<SystemWalletSummaryRow[]> {
  const wallets = await db.wallet.findMany({
    where: { isSystem: true, systemKey: { not: null } },
    orderBy: { createdAt: 'asc' },
  })
  return Promise.all(
    wallets.map(async (w) => {
      const balance = await getWalletBalance(w.id)
      const floor = w.floor_kcrd !== null ? new Prisma.Decimal(w.floor_kcrd) : null
      const headroom = floor !== null ? balance.sub(floor) : null
      return { walletId: w.id, key: w.systemKey!, balance, floor, headroom }
    }),
  )
}

export async function getTotalCirculatingCredits(): Promise<Prisma.Decimal> {
  const netAgg = await db.ledgerEntry.aggregate({
    where: { wallet: { isSystem: false } },
    _sum: { amount: true },
  })
  return new Prisma.Decimal(netAgg._sum.amount ?? 0)
}

export async function getActiveMemberCount(): Promise<number> {
  return db.user.count({ where: { status: 'ACTIVE' } })
}

export async function getPendingApprovalCount(): Promise<number> {
  return db.settlementRequest.count({ where: { status: 'PENDING_APPROVAL' } })
}

export async function getOpenIssueCount(): Promise<number> {
  return db.issue.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } })
}

export interface RoleFlowRow {
  role: Role
  totalDeposits: Prisma.Decimal
  totalSettlements: Prisma.Decimal
}

export async function getTreasuryFlowByRole(): Promise<RoleFlowRow[]> {
  const roles: Role[] = ['RESIDENT', 'VENDOR', 'VISITOR', 'ADMIN', 'MASTER_ADMIN']

  const [depositRows, settlementRows] = await Promise.all([
    db.deposit.groupBy({
      by: ['userId'],
      _sum: { fiatAmount: true },
    }),
    db.settlementRequest.groupBy({
      by: ['userId'],
      where: { status: { in: ['APPROVED', 'SETTLED'] } },
      _sum: { amount: true },
    }),
  ])

  const userIds = Array.from(
    new Set([...depositRows.map((r) => r.userId), ...settlementRows.map((r) => r.userId)]),
  )
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, role: true },
  })
  const roleMap = new Map(users.map((u) => [u.id, u.role]))

  const depositsByRole = new Map<Role, Prisma.Decimal>()
  const settlementsByRole = new Map<Role, Prisma.Decimal>()

  for (const row of depositRows) {
    const role = roleMap.get(row.userId)
    if (!role) continue
    const cur = depositsByRole.get(role) ?? new Prisma.Decimal(0)
    depositsByRole.set(role, cur.add(row._sum.fiatAmount ?? 0))
  }

  for (const row of settlementRows) {
    const role = roleMap.get(row.userId)
    if (!role) continue
    const cur = settlementsByRole.get(role) ?? new Prisma.Decimal(0)
    settlementsByRole.set(role, cur.add(row._sum.amount ?? 0))
  }

  return roles
    .filter((r) => depositsByRole.has(r) || settlementsByRole.has(r))
    .map((role) => ({
      role,
      totalDeposits: depositsByRole.get(role) ?? new Prisma.Decimal(0),
      totalSettlements: settlementsByRole.get(role) ?? new Prisma.Decimal(0),
    }))
}

export interface RoleBalanceRow {
  role: Role
  totalBalance: Prisma.Decimal
  memberCount: number
}

export async function getCreditsByRole(): Promise<RoleBalanceRow[]> {
  const roles: Role[] = ['RESIDENT', 'VENDOR', 'VISITOR', 'ADMIN', 'MASTER_ADMIN']

  const wallets = await db.wallet.findMany({
    where: { isSystem: false, userId: { not: null } },
    include: { user: { select: { role: true } } },
  })

  const balanceByRole = new Map<Role, Prisma.Decimal>()
  const countByRole = new Map<Role, number>()

  await Promise.all(
    wallets.map(async (w) => {
      const role = w.user?.role
      if (!role) return
      const bal = await getWalletBalance(w.id)
      const cur = balanceByRole.get(role) ?? new Prisma.Decimal(0)
      balanceByRole.set(role, cur.add(bal))
      countByRole.set(role, (countByRole.get(role) ?? 0) + 1)
    }),
  )

  return roles
    .filter((r) => countByRole.has(r))
    .map((role) => ({
      role,
      totalBalance: balanceByRole.get(role) ?? new Prisma.Decimal(0),
      memberCount: countByRole.get(role) ?? 0,
    }))
}
