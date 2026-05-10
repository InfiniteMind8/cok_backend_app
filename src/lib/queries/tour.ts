import { db } from '../db.js'

export async function getTourStatus(userId: string): Promise<{ shouldShow: boolean }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      onboardingTourCompletedAt: true,
      onboardingTourDismissedAt: true,
    },
  })
  return {
    shouldShow:
      user != null &&
      user.onboardingTourCompletedAt == null &&
      user.onboardingTourDismissedAt == null,
  }
}
