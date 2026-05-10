import type { DisplayCurrency, PromotionDirection, Role } from '@prisma/client'
import { db } from '../db.js'

export type ApplicablePromotion = {
  id: string
  name: string
  bonusPercent: string // Decimal serialised
}

export async function getApplicablePromotion(
  userId: string,
  direction: PromotionDirection,
  fiatCurrency: DisplayCurrency,
  at: Date = new Date(),
): Promise<ApplicablePromotion | null> {
  void fiatCurrency
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, foundingMember: true },
  })
  if (!user) return null

  const candidates = await db.conversionPromotion.findMany({
    where: {
      active: true,
      direction,
      startsAt: { lte: at },
      endsAt: { gt: at },
    },
    orderBy: { bonusPercent: 'desc' },
  })

  for (const promo of candidates) {
    const eligible = isEligible(promo, userId, user.role, user.foundingMember)
    if (eligible) {
      return {
        id: promo.id,
        name: promo.name,
        bonusPercent: promo.bonusPercent.toString(),
      }
    }
  }
  return null
}

function isEligible(
  promo: { eligibility: string; eligibleUserIds: string[] },
  userId: string,
  role: Role,
  isFoundingMember: boolean,
): boolean {
  switch (promo.eligibility) {
    case 'ALL':
      return true
    case 'FOUNDING_MEMBERS':
      return isFoundingMember
    case 'RESIDENTS_ONLY':
      return role === 'RESIDENT'
    case 'SPECIFIC_USERS':
      return promo.eligibleUserIds.includes(userId)
    default:
      return false
  }
}
