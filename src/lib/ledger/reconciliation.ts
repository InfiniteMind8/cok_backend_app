import { Prisma } from '@prisma/client'
import { db } from '../db.js'
import type { ReconciliationResult } from './types.js'

export async function reconcileTreasury(): Promise<ReconciliationResult> {
  const [allAgg, issuedAgg] = await Promise.all([
    db.ledgerEntry.aggregate({ _sum: { amount: true } }),
    db.ledgerEntry.aggregate({
      where: {
        transaction: { type: 'TREASURY_ADJUSTMENT' },
        amount: { gt: 0 },
      },
      _sum: { amount: true },
    }),
  ])

  const sumAllEntries = new Prisma.Decimal(allAgg._sum.amount ?? 0)
  const totalIssued = new Prisma.Decimal(issuedAgg._sum.amount ?? 0)
  const discrepancy = totalIssued.sub(sumAllEntries)

  return {
    isBalanced: discrepancy.eq(0),
    totalIssued,
    sumAllEntries,
    discrepancy,
  }
}
