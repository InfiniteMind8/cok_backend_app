import { Prisma, type TransactionType } from '@prisma/client'
import { db } from '../db.js'
import type { FeeScheduleRules, FeeRuleEntry, FeeSplit } from './types.js'

const HUNDRED = new Prisma.Decimal(100)
// Banker's rounding (round half to even) for fee calculations
const BANKER = Prisma.Decimal.ROUND_HALF_EVEN

const ZERO_RULE: FeeRuleEntry = {
  totalPct: 0,
  communityFundPct: 0,
  operationsFundPct: 0,
  developerSharePct: 0,
}

export async function getActiveFeeSchedule(at: Date = new Date()) {
  return db.feeSchedule.findFirst({
    where: { effectiveTo: null, effectiveAt: { lte: at } },
    orderBy: { effectiveAt: 'desc' },
  })
}

export function calculateFee(
  type: TransactionType,
  grossAmount: Prisma.Decimal,
  rules: FeeScheduleRules,
): FeeSplit {
  const rule = rules[type] ?? ZERO_RULE

  const communityFund = grossAmount
    .mul(new Prisma.Decimal(rule.communityFundPct))
    .div(HUNDRED)
    .toDecimalPlaces(2, BANKER)

  const operationsFund = grossAmount
    .mul(new Prisma.Decimal(rule.operationsFundPct))
    .div(HUNDRED)
    .toDecimalPlaces(2, BANKER)

  const developerShare = grossAmount
    .mul(new Prisma.Decimal(rule.developerSharePct))
    .div(HUNDRED)
    .toDecimalPlaces(2, BANKER)

  // totalFee = sum of parts (not gross × totalPct) so zero-sum holds under rounding
  const totalFee = communityFund.add(operationsFund).add(developerShare)
  const netAmount = grossAmount.sub(totalFee)

  return { netAmount, totalFee, communityFund, operationsFund, developerShare }
}
