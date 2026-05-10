import { Prisma, type Role, type TransactionType } from '@prisma/client'
import { db } from '../db.js'
import { transferCredits } from './service.js'

interface RequestSettlementArgs {
  userId: string
  amount: Prisma.Decimal | number | string
  purpose?: string
}

interface ApproveSettlementArgs {
  settlementId: string
  approvedBy: string
}

interface DeclineSettlementArgs {
  settlementId: string
  declinedBy: string
  reason: string
}

interface ExecuteSettlementArgs {
  settlementId: string
  settledBy: string
  proofUrl?: string
  idempotencyKey?: string
}

function settlementTypeForRole(role: Role): TransactionType {
  switch (role) {
    case 'VENDOR':
      return 'VENDOR_SETTLEMENT'
    case 'VISITOR':
      return 'VISITOR_SETTLEMENT'
    default:
      return 'RESIDENT_SETTLEMENT'
  }
}

function settledResultFromRequest(request: {
  amount: Prisma.Decimal | number | string
  transactionId: string | null
}) {
  if (!request.transactionId) {
    throw new Error('Settlement is SETTLED but has no transactionId')
  }

  const amount = new Prisma.Decimal(request.amount)
  return {
    transactionId: request.transactionId,
    grossAmount: amount,
    netAmount: amount,
    feeSplit: {
      netAmount: amount,
      totalFee: new Prisma.Decimal(0),
      communityFund: new Prisma.Decimal(0),
      operationsFund: new Prisma.Decimal(0),
      developerShare: new Prisma.Decimal(0),
    },
    feeScheduleId: null,
  }
}

export async function requestSettlement(args: RequestSettlementArgs) {
  const amount = new Prisma.Decimal(args.amount)
  if (amount.lte(0)) throw new Error('Settlement amount must be positive')

  return db.settlementRequest.create({
    data: {
      userId: args.userId,
      amount,
      status: 'PENDING_APPROVAL',
      purpose: args.purpose,
    },
  })
}

export async function approveSettlement(args: ApproveSettlementArgs) {
  const request = await db.settlementRequest.findUnique({
    where: { id: args.settlementId },
  })
  if (!request) throw new Error(`Settlement ${args.settlementId} not found`)
  if (request.status !== 'PENDING_APPROVAL') {
    throw new Error(`Cannot approve settlement in status ${request.status}`)
  }

  return db.settlementRequest.update({
    where: { id: args.settlementId },
    data: {
      status: 'APPROVED',
      approvedBy: args.approvedBy,
      approvedAt: new Date(),
    },
  })
}

export async function declineSettlement(args: DeclineSettlementArgs) {
  const request = await db.settlementRequest.findUnique({
    where: { id: args.settlementId },
  })
  if (!request) throw new Error(`Settlement ${args.settlementId} not found`)
  if (request.status !== 'PENDING_APPROVAL') {
    throw new Error(`Cannot decline settlement in status ${request.status}`)
  }

  return db.settlementRequest.update({
    where: { id: args.settlementId },
    data: {
      status: 'DECLINED',
      declinedReason: args.reason,
    },
  })
}

export async function executeSettlement(args: ExecuteSettlementArgs) {
  if (args.idempotencyKey) {
    const existing = await db.settlementRequest.findUnique({
      where: { id: args.settlementId },
      select: { status: true, amount: true, transactionId: true },
    })
    if (existing?.status === 'SETTLED' && existing.transactionId) {
      return settledResultFromRequest(existing)
    }
  }

  return db.$transaction(async (tx) => {
    const settledAt = new Date()
    const updated = await tx.settlementRequest.updateMany({
      where: { id: args.settlementId, status: 'APPROVED' },
      data: {
        status: 'SETTLED',
        settledBy: args.settledBy,
        settledAt,
        proofUrl: args.proofUrl,
      },
    })

    if (updated.count !== 1) {
      if (args.idempotencyKey) {
        const existing = await tx.settlementRequest.findUnique({
          where: { id: args.settlementId },
          select: { status: true, amount: true, transactionId: true },
        })
        if (existing?.status === 'SETTLED' && existing.transactionId) {
          return settledResultFromRequest(existing)
        }
      }

      const current = await tx.settlementRequest.findUnique({
        where: { id: args.settlementId },
        select: { status: true },
      })
      if (!current) throw new Error(`Settlement ${args.settlementId} not found`)
      throw new Error(
        `Settlement ${args.settlementId} is not APPROVED; Cannot execute settlement in status ${current.status}`,
      )
    }

    const request = await tx.settlementRequest.findUnique({
      where: { id: args.settlementId },
      select: { userId: true, amount: true },
    })
    if (!request) throw new Error(`Settlement ${args.settlementId} not found`)

    const user = await tx.user.findUnique({
      where: { id: request.userId },
      select: { role: true },
    })
    if (!user) throw new Error(`User ${request.userId} not found`)

    const userWallet = await tx.wallet.findUnique({ where: { userId: request.userId } })
    if (!userWallet) throw new Error(`No wallet found for user ${request.userId}`)

    const burnWallet = await tx.wallet.findUnique({ where: { systemKey: 'settlement_burn' } })
    if (!burnWallet) throw new Error('settlement_burn system wallet not found')

    const txType = settlementTypeForRole(user.role)
    const amount = new Prisma.Decimal(request.amount)

    const result = await transferCredits(
      {
        fromWalletId: userWallet.id,
        toWalletId: burnWallet.id,
        amount,
        type: txType,
        description: `Settlement execution — ${txType}`,
        initiatedBy: args.settledBy,
      },
      { tx },
    )

    await tx.settlementRequest.update({
      where: { id: args.settlementId },
      data: {
        transactionId: result.transactionId,
      },
    })

    return result
  })
}
