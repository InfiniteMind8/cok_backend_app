import { Prisma } from '@prisma/client'
import { db } from '../db.js'
import { env } from '../env.js'
import { reconcileTreasury } from './reconciliation.js'

interface DepositRequest {
  userId: string
  fiatAmount: Prisma.Decimal | number | string
  currency?: string
  paymentMethod: string
  proofUrl?: string
  recordedBy: string
}

export async function recordDeposit(req: DepositRequest) {
  const kAmount = new Prisma.Decimal(req.fiatAmount) // 1:1 conversion rate

  if (kAmount.lte(0)) {
    throw new Error(`Deposit amount must be positive, got ${kAmount}`)
  }

  const [userWallet, treasuryWallet] = await Promise.all([
    db.wallet.findUnique({ where: { userId: req.userId } }),
    db.wallet.findUnique({ where: { systemKey: 'treasury_reserve' } }),
  ])
  if (!userWallet) throw new Error(`No wallet found for user ${req.userId}`)
  if (!treasuryWallet) throw new Error('treasury_reserve system wallet not found')

  const result = await db.$transaction(async (tx) => {
    const txRow = await tx.transaction.create({
      data: {
        type: 'DEPOSIT',
        description: `Deposit of ${req.currency ?? 'USD'} ${req.fiatAmount}`,
        initiatedBy: req.userId,
        entries: {
          createMany: {
            data: [
              {
                walletId: userWallet.id,
                amount: kAmount,
                description: 'K Credit deposit',
              },
              {
                walletId: treasuryWallet.id,
                amount: kAmount.neg(),
                description: 'Treasury reserve backing',
              },
            ],
          },
        },
      },
    })

    await tx.deposit.create({
      data: {
        userId: req.userId,
        fiatAmount: new Prisma.Decimal(req.fiatAmount),
        currency: req.currency ?? 'USD',
        paymentMethod: req.paymentMethod,
        proofUrl: req.proofUrl,
        recordedBy: req.recordedBy,
        transactionId: txRow.id,
      },
    })

    return txRow.id
  })

  if (env.NODE_ENV === 'development') {
    const check = await reconcileTreasury()
    if (!check.isBalanced) {
      throw new Error(
        `RECONCILIATION FAILED after deposit ${result}: discrepancy ${check.discrepancy}`,
      )
    }
  }

  return { transactionId: result, kAmount }
}
