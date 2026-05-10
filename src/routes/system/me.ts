import { Hono } from 'hono'
import type { AppEnv } from '../../server.js'
import { ApiError } from '../../lib/api-error.js'
import { prisma } from '../../lib/prisma.js'

export const meRoute = new Hono<AppEnv>()

meRoute.get('/', async (c) => {
  const user = c.get('user')
  if (!user) throw ApiError.unauthorized()

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      clerkId: true,
      email: true,
      fullName: true,
      role: true,
      memberId: true,
      profilePhotoUrl: true,
      displayCurrency: true,
      foundingMember: true,
      // MFA enrolment lives on Clerk, not Prisma. Callers that need this
      // should hit Clerk's getUser() — see src/lib/mfa/index.ts.
      onboardingTourCompletedAt: true,
      onboardingTourDismissedAt: true,
      createdAt: true,
    },
  })

  if (!fullUser) throw ApiError.notFound('User record missing')

  return c.json({ ok: true, data: fullUser })
})
