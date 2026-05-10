import { Prisma, type TransactionType } from '@prisma/client'

export type { TransactionType }

export class FloorBreachError extends Error {
  override readonly name = 'FloorBreachError'
  constructor(
    public readonly walletKey: string,
    public readonly postTransferBalance: Prisma.Decimal,
    public readonly floor: Prisma.Decimal,
    public readonly headroom: Prisma.Decimal,
  ) {
    super(
      `System wallet "${walletKey}" floor breach: post-transfer balance ${postTransferBalance.toFixed(8)} < floor ${floor.toFixed(8)}`,
    )
  }
}

export interface SystemWalletFloor {
  walletId: string
  key: string
  balance: Prisma.Decimal
  floor: Prisma.Decimal | null
  headroom: Prisma.Decimal | null
}

export interface FeeRuleEntry {
  totalPct: number
  communityFundPct: number
  operationsFundPct: number
  developerSharePct: number
}

export type FeeScheduleRules = Partial<Record<TransactionType, FeeRuleEntry>>

export interface FeeSplit {
  netAmount: Prisma.Decimal
  totalFee: Prisma.Decimal
  communityFund: Prisma.Decimal
  operationsFund: Prisma.Decimal
  developerShare: Prisma.Decimal
}

export interface TransferRequest {
  fromWalletId: string
  toWalletId: string
  amount: Prisma.Decimal
  type: TransactionType
  description: string
  reference?: string
  initiatedBy?: string
  metadata?: Record<string, unknown>
}

export interface TransferResult {
  transactionId: string
  grossAmount: Prisma.Decimal
  netAmount: Prisma.Decimal
  feeSplit: FeeSplit
  feeScheduleId: string | null
}

export interface PerWalletSummary {
  balance: Prisma.Decimal
  totalDeposited: Prisma.Decimal
  totalEarned: Prisma.Decimal
  totalEligibleForConversion: Prisma.Decimal
}

export interface WalletRow {
  walletId: string
  userId: string | null
  systemKey: string | null
  isSystem: boolean
  balance: Prisma.Decimal
  displayName: string
}

export interface ReconciliationResult {
  isBalanced: boolean
  totalIssued: Prisma.Decimal
  sumAllEntries: Prisma.Decimal
  discrepancy: Prisma.Decimal
}

export interface ReconciliationReportDetails {
  netSum: string
  totalCredits: string
  totalDebits: string
  walletCount: number
  discrepancy: string
}
