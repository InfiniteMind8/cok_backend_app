import { Prisma, type TransactionType } from '@prisma/client'
import { db } from '../db.js'
import type { PerWalletSummary, WalletRow } from './types.js'

export function formatKCredit(amount: Prisma.Decimal | string | number): string {
  const d = new Prisma.Decimal(amount)
  const formatted = d.toFixed(2)
  const [integer, decimal] = formatted.split('.')
  const withCommas = (integer ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `K ${withCommas}.${decimal ?? '00'}`
}

export async function getWalletBalance(walletId: string): Promise<Prisma.Decimal> {
  const agg = await db.ledgerEntry.aggregate({
    where: { walletId },
    _sum: { amount: true },
  })
  return new Prisma.Decimal(agg._sum.amount ?? 0)
}

const EARNED_TYPES: TransactionType[] = ['PURCHASE', 'BARTER', 'PAYROLL', 'TRANSFER']
const SETTLEMENT_TYPES: TransactionType[] = [
  'RESIDENT_SETTLEMENT',
  'VENDOR_SETTLEMENT',
  'VISITOR_SETTLEMENT',
]

export async function getWalletSummary(walletId: string): Promise<PerWalletSummary> {
  const [balance, depositedAgg, earnedAgg, settledAgg] = await Promise.all([
    getWalletBalance(walletId),
    db.ledgerEntry.aggregate({
      where: { walletId, amount: { gt: 0 }, transaction: { type: 'DEPOSIT' } },
      _sum: { amount: true },
    }),
    db.ledgerEntry.aggregate({
      where: {
        walletId,
        amount: { gt: 0 },
        transaction: { type: { in: EARNED_TYPES } },
      },
      _sum: { amount: true },
    }),
    db.ledgerEntry.aggregate({
      where: {
        walletId,
        amount: { gt: 0 },
        transaction: { type: { in: SETTLEMENT_TYPES } },
      },
      _sum: { amount: true },
    }),
  ])

  return {
    balance,
    totalDeposited: new Prisma.Decimal(depositedAgg._sum.amount ?? 0),
    totalEarned: new Prisma.Decimal(earnedAgg._sum.amount ?? 0),
    totalEligibleForConversion: new Prisma.Decimal(settledAgg._sum.amount ?? 0),
  }
}

export async function getAllWalletRows(): Promise<WalletRow[]> {
  const wallets = await db.wallet.findMany({
    include: { user: { select: { email: true, fullName: true } } },
    orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
  })

  return Promise.all(
    wallets.map(async (w) => ({
      walletId: w.id,
      userId: w.userId,
      systemKey: w.systemKey,
      isSystem: w.isSystem,
      balance: await getWalletBalance(w.id),
      displayName: w.isSystem
        ? (w.systemKey ?? 'system')
        : (w.user?.email ?? w.userId ?? 'unknown'),
    })),
  )
}
