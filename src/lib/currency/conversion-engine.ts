import type { DisplayCurrency } from '@prisma/client'
import { Prisma, PromotionDirection } from '@prisma/client'
import { db } from '../db.js'
import { transferCredits } from '../ledger/service.js'
import { getActiveRate } from './rate-resolver.js'
import { getApplicablePromotion } from './promotion-resolver.js'

const HUNDRED = new Prisma.Decimal(100)

export type ConversionResult =
  | {
      ok: true
      baseKcrd: string
      bonusKcrd: string
      totalKcrd: string
      promotionId: string | null
      promotionName: string | null
    }
  | {
      ok: false
      error: string
    }

export async function convertFiatToKcrd(params: {
  userId: string
  fiatAmount: string | number
  fiatCurrency: DisplayCurrency
  recordedBy: string
}): Promise<ConversionResult> {
  const { userId, fiatCurrency, recordedBy } = params
  const fiatAmount = new Prisma.Decimal(String(params.fiatAmount))

  if (fiatAmount.lte(0)) {
    return { ok: false, error: 'Amount must be greater than zero.' }
  }
  if (fiatCurrency === 'KCRD') {
    return { ok: false, error: 'Fiat currency cannot be KCRD.' }
  }

  const now = new Date()
  const rateStr = await getActiveRate(fiatCurrency, 'KCRD', now)
  if (!rateStr) {
    return { ok: false, error: `No active rate found for ${fiatCurrency} → KCRD.` }
  }
  const rate = new Prisma.Decimal(rateStr)
  const baseKcrd = fiatAmount.mul(rate).toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_EVEN)

  const promotion = await getApplicablePromotion(userId, PromotionDirection.FIAT_TO_KCRD, fiatCurrency, now)
  const bonusKcrd = promotion
    ? baseKcrd
        .mul(new Prisma.Decimal(promotion.bonusPercent))
        .div(HUNDRED)
        .toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_EVEN)
    : new Prisma.Decimal(0)
  const totalKcrd = baseKcrd.add(bonusKcrd)

  const [userWallet, fiatSettlementWallet, promotionsWallet] = await Promise.all([
    db.wallet.findUnique({ where: { userId }, select: { id: true } }),
    db.wallet.findUnique({ where: { systemKey: 'fiat_settlement' }, select: { id: true } }),
    db.wallet.findUnique({ where: { systemKey: 'promotions' }, select: { id: true } }),
  ])

  if (!userWallet) return { ok: false, error: 'User wallet not found.' }
  if (!fiatSettlementWallet) return { ok: false, error: 'Fiat settlement wallet not found.' }

  await db.$transaction(async (tx) => {
    // Base conversion: fiat_settlement → user
    const baseTx = await tx.transaction.create({
      data: {
        type: 'FIAT_CONVERSION',
        description: `Fiat conversion: ${fiatAmount.toFixed(2)} ${fiatCurrency} → ${baseKcrd.toFixed(8)} KCRD @ ${rate.toFixed(8)}`,
        initiatedBy: recordedBy,
        metadata: { fiatAmount: fiatAmount.toFixed(2), fiatCurrency, rate: rateStr },
      },
    })
    await tx.ledgerEntry.createMany({
      data: [
        { transactionId: baseTx.id, walletId: fiatSettlementWallet.id, amount: baseKcrd.neg(), description: `Fiat settlement debit` },
        { transactionId: baseTx.id, walletId: userWallet.id, amount: baseKcrd, description: `KCRD received from ${fiatCurrency} conversion` },
      ],
    })

    // Bonus: promotions → user (if applicable)
    if (promotion && bonusKcrd.gt(0) && promotionsWallet) {
      const bonusTx = await tx.transaction.create({
        data: {
          type: 'CONVERSION_BONUS',
          description: `Conversion bonus: +${promotion.bonusPercent}% from promotion "${promotion.name}"`,
          initiatedBy: recordedBy,
          metadata: { promotionId: promotion.id, bonusPercent: promotion.bonusPercent },
        },
      })
      await tx.ledgerEntry.createMany({
        data: [
          { transactionId: bonusTx.id, walletId: promotionsWallet.id, amount: bonusKcrd.neg(), description: `Promotion bonus debit` },
          { transactionId: bonusTx.id, walletId: userWallet.id, amount: bonusKcrd, description: `Conversion bonus from "${promotion.name}"` },
        ],
      })
    }

    await tx.auditLog.create({
      data: {
        action: 'fiat.conversion',
        entity: 'User',
        entityId: userId,
        actorId: recordedBy,
        after: {
          fiatAmount: fiatAmount.toFixed(2),
          fiatCurrency,
          baseKcrd: baseKcrd.toFixed(8),
          bonusKcrd: bonusKcrd.toFixed(8),
          promotionId: promotion?.id ?? null,
        },
      },
    })
  })

  return {
    ok: true,
    baseKcrd: baseKcrd.toFixed(8),
    bonusKcrd: bonusKcrd.toFixed(8),
    totalKcrd: totalKcrd.toFixed(8),
    promotionId: promotion?.id ?? null,
    promotionName: promotion?.name ?? null,
  }
}

export async function convertKcrdToFiat(params: {
  userId: string
  kcrdAmount: string | number
  targetCurrency: DisplayCurrency
  recordedBy: string
}): Promise<ConversionResult> {
  const { userId, targetCurrency, recordedBy } = params
  const kcrdAmount = new Prisma.Decimal(String(params.kcrdAmount))

  if (kcrdAmount.lte(0)) {
    return { ok: false, error: 'Amount must be greater than zero.' }
  }
  if (targetCurrency === 'KCRD') {
    return { ok: false, error: 'Target currency cannot be KCRD.' }
  }

  const now = new Date()
  const rateStr = await getActiveRate('KCRD', targetCurrency, now)
  if (!rateStr) {
    return { ok: false, error: `No active rate found for KCRD → ${targetCurrency}.` }
  }

  const promotion = await getApplicablePromotion(userId, PromotionDirection.KCRD_TO_FIAT, targetCurrency, now)
  const bonusKcrd = promotion
    ? kcrdAmount
        .mul(new Prisma.Decimal(promotion.bonusPercent))
        .div(HUNDRED)
        .toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_EVEN)
    : new Prisma.Decimal(0)

  const [userWallet, fiatSettlementWallet, promotionsWallet] = await Promise.all([
    db.wallet.findUnique({ where: { userId }, select: { id: true } }),
    db.wallet.findUnique({ where: { systemKey: 'fiat_settlement' }, select: { id: true } }),
    db.wallet.findUnique({ where: { systemKey: 'promotions' }, select: { id: true } }),
  ])

  if (!userWallet) return { ok: false, error: 'User wallet not found.' }
  if (!fiatSettlementWallet) return { ok: false, error: 'Fiat settlement wallet not found.' }
  if (promotion && bonusKcrd.gt(0) && !promotionsWallet) {
    throw new Error('Promotion resolved but promotions wallet not found — refusing to silently omit bonus')
  }

  await db.$transaction(async (tx) => {
    await transferCredits(
      {
        fromWalletId: userWallet.id,
        toWalletId: fiatSettlementWallet.id,
        amount: kcrdAmount,
        type: 'FIAT_CONVERSION',
        description: `KCRD -> ${targetCurrency} conversion @ rate ${rateStr}`,
        initiatedBy: recordedBy,
        metadata: {
          kcrdAmount: kcrdAmount.toFixed(8),
          targetCurrency,
          rate: rateStr,
        },
      },
      { tx },
    )

    if (promotion && bonusKcrd.gt(0)) {
      if (!promotionsWallet) {
        throw new Error('Promotion resolved but promotions wallet not found — refusing to silently omit bonus')
      }
      const bonusTx = await tx.transaction.create({
        data: {
          type: 'CONVERSION_BONUS',
          description: `Outbound conversion bonus: +${promotion.bonusPercent}% from "${promotion.name}"`,
          initiatedBy: recordedBy,
          metadata: { promotionId: promotion.id },
        },
      })
      await tx.ledgerEntry.createMany({
        data: [
          { transactionId: bonusTx.id, walletId: promotionsWallet.id, amount: bonusKcrd.neg(), description: `Bonus debit` },
          { transactionId: bonusTx.id, walletId: userWallet.id, amount: bonusKcrd, description: `Outbound conversion bonus` },
        ],
      })
    }

    await tx.auditLog.create({
      data: {
        action: 'kcrd.conversion',
        entity: 'User',
        entityId: userId,
        actorId: recordedBy,
        after: {
          kcrdAmount: kcrdAmount.toFixed(8),
          targetCurrency,
          bonusKcrd: bonusKcrd.toFixed(8),
          promotionId: promotion?.id ?? null,
        },
      },
    })
  })

  return {
    ok: true,
    baseKcrd: kcrdAmount.toFixed(8),
    bonusKcrd: bonusKcrd.toFixed(8),
    totalKcrd: kcrdAmount.add(bonusKcrd).toFixed(8),
    promotionId: promotion?.id ?? null,
    promotionName: promotion?.name ?? null,
  }
}
