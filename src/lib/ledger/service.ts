import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from '../db.js'
import { env } from '../env.js'
import { getActiveFeeSchedule, calculateFee } from './fee-engine.js'
import { reconcileTreasury } from './reconciliation.js'
import { FloorBreachError } from './types.js'
import type { TransferRequest, TransferResult, FeeScheduleRules } from './types.js'

interface TransferOptions {
  tx?: Prisma.TransactionClient
}

function walletIdToLockKey(walletId: string): bigint {
  return BigInt(`0x${createHash('sha256').update(walletId).digest('hex').slice(0, 15)}`)
}

async function acquireWalletLocks(tx: Prisma.TransactionClient, walletIds: string[]) {
  if (typeof tx.$queryRaw !== 'function') return

  const lockKeys = [...new Set(walletIds.map(walletIdToLockKey))]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  for (const lockKey of lockKeys) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`
  }
}

export async function transferCredits(
  req: TransferRequest,
  options?: TransferOptions,
): Promise<TransferResult> {
  if (req.amount.lte(0)) {
    throw new Error(`Amount must be positive, got ${req.amount}`)
  }

  const schedule = await getActiveFeeSchedule()
  const rules = (schedule?.rules ?? {}) as FeeScheduleRules
  const feeSplit = calculateFee(req.type, req.amount, rules)

  const run = async (tx: Prisma.TransactionClient) => {
    const [fromWallet, toWallet, systemWallets] = await Promise.all([
      tx.wallet.findUnique({
        where: { id: req.fromWalletId },
        select: { id: true, isSystem: true, systemKey: true, floor_kcrd: true },
      }),
      tx.wallet.findUnique({ where: { id: req.toWalletId }, select: { id: true } }),
      tx.wallet.findMany({
        where: { isSystem: true },
        select: { id: true, systemKey: true },
      }),
    ])
    if (!fromWallet) throw new Error(`Wallet not found: ${req.fromWalletId}`)
    if (!toWallet) throw new Error(`Wallet not found: ${req.toWalletId}`)

    const sysMap = new Map((systemWallets ?? []).map((w) => [w.systemKey, w.id]))
    const lockWalletIds = [req.fromWalletId, req.toWalletId]

    if (feeSplit.communityFund.gt(0)) {
      const id = sysMap.get('community_fund')
      if (!id) throw new Error('System wallet community_fund not found')
      lockWalletIds.push(id)
    }
    if (feeSplit.operationsFund.gt(0)) {
      const id = sysMap.get('operations_fund')
      if (!id) throw new Error('System wallet operations_fund not found')
      lockWalletIds.push(id)
    }
    if (feeSplit.developerShare.gt(0)) {
      const id = sysMap.get('developer_share')
      if (!id) throw new Error('System wallet developer_share not found')
      lockWalletIds.push(id)
    }

    await acquireWalletLocks(tx, lockWalletIds)

    const balanceAgg = await tx.ledgerEntry.aggregate({
      where: { walletId: req.fromWalletId },
      _sum: { amount: true },
    })
    const senderBalance = new Prisma.Decimal(balanceAgg._sum.amount ?? 0)
    if (senderBalance.lt(req.amount)) {
      throw new Error(
        `Insufficient balance: wallet ${req.fromWalletId} has ${senderBalance}, needs ${req.amount}`,
      )
    }

    if (fromWallet.isSystem && fromWallet.floor_kcrd !== null) {
      const floor = new Prisma.Decimal(fromWallet.floor_kcrd)
      const postTransferBalance = senderBalance.sub(req.amount)
      if (postTransferBalance.lt(floor)) {
        const headroom = postTransferBalance.sub(floor)
        throw new FloorBreachError(
          fromWallet.systemKey ?? fromWallet.id,
          postTransferBalance,
          floor,
          headroom,
        )
      }
    }

    const entries: Array<{ walletId: string; amount: Prisma.Decimal; description?: string }> = [
      { walletId: req.fromWalletId, amount: req.amount.neg(), description: req.description },
      { walletId: req.toWalletId, amount: feeSplit.netAmount, description: req.description },
    ]

    if (feeSplit.communityFund.gt(0)) {
      const id = sysMap.get('community_fund')
      if (!id) throw new Error('System wallet community_fund not found')
      entries.push({ walletId: id, amount: feeSplit.communityFund, description: 'Fee: community fund' })
    }
    if (feeSplit.operationsFund.gt(0)) {
      const id = sysMap.get('operations_fund')
      if (!id) throw new Error('System wallet operations_fund not found')
      entries.push({ walletId: id, amount: feeSplit.operationsFund, description: 'Fee: operations fund' })
    }
    if (feeSplit.developerShare.gt(0)) {
      const id = sysMap.get('developer_share')
      if (!id) throw new Error('System wallet developer_share not found')
      entries.push({ walletId: id, amount: feeSplit.developerShare, description: 'Fee: developer share' })
    }

    const sum = entries.reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal(0))
    if (!sum.eq(0)) {
      throw new Error(`Ledger entries do not sum to zero: ${sum.toFixed(8)}`)
    }

    const txRow = await tx.transaction.create({
      data: {
        type: req.type,
        description: req.description,
        reference: req.reference,
        feeScheduleId: schedule?.id ?? null,
        initiatedBy: req.initiatedBy,
        metadata:
          req.metadata !== undefined
            ? (req.metadata as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        entries: {
          createMany: {
            data: entries.map((e) => ({
              walletId: e.walletId,
              amount: e.amount,
              description: e.description,
            })),
          },
        },
      },
    })

    return txRow.id
  }

  const transactionId = options?.tx ? await run(options.tx) : await db.$transaction(run)

  if (!options?.tx && env.NODE_ENV === 'development') {
    const check = await reconcileTreasury()
    if (!check.isBalanced) {
      throw new Error(
        `RECONCILIATION FAILED after transaction ${transactionId}: discrepancy ${check.discrepancy}`,
      )
    }
  }

  return {
    transactionId,
    grossAmount: req.amount,
    netAmount: feeSplit.netAmount,
    feeSplit,
    feeScheduleId: schedule?.id ?? null,
  }
}
