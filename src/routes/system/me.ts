import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { AppEnv } from '../../server.js'
import { ApiError } from '../../lib/api-error.js'
import { db } from '../../lib/db.js'
import { requireRole } from '../../middleware/auth.js'
import { getStorage } from '../../lib/storage/driver.js'

export const meRoute = new Hono<AppEnv>()

// ─── GET / — current user profile ────────────────────────────────────────────
meRoute.get('/', async (c) => {
  const user = c.get('user')
  if (!user) throw ApiError.unauthorized()

  const fullUser = await db.user.findUnique({
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

// ─── POST /tour/complete | /tour/dismiss ─────────────────────────────────────
meRoute.post('/tour/complete', async (c) => {
  const user = c.get('user')!
  await db.user.update({
    where: { id: user.id },
    data: { onboardingTourCompletedAt: new Date() },
  })
  return c.json({ ok: true, data: { completed: true } })
})

meRoute.post('/tour/dismiss', async (c) => {
  const user = c.get('user')!
  await db.user.update({
    where: { id: user.id },
    data: { onboardingTourDismissedAt: new Date() },
  })
  return c.json({ ok: true, data: { dismissed: true } })
})

// ─── POST /notifications/mark-all-read ───────────────────────────────────────
meRoute.post('/notifications/mark-all-read', async (c) => {
  const user = c.get('user')!
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  })
  return c.json({ ok: true, data: { markedRead: true } })
})

// ─── POST /profile/display-currency ──────────────────────────────────────────
const displayCurrencySchema = z.object({
  currency: z.enum(['KCRD', 'USD', 'GYD']),
})

meRoute.post(
  '/profile/display-currency',
  requireRole('RESIDENT', 'VISITOR'),
  zValidator('json', displayCurrencySchema),
  async (c) => {
    const user = c.get('user')!
    const { currency } = c.req.valid('json')
    await db.user.update({
      where: { id: user.id },
      data: { displayCurrency: currency },
    })
    return c.json({ ok: true, data: { currency } })
  },
)

// ─── POST /profile/introduction ──────────────────────────────────────────────
const introductionSchema = z.object({
  introduction: z.string(),
})

meRoute.post(
  '/profile/introduction',
  requireRole('RESIDENT'),
  zValidator('json', introductionSchema),
  async (c) => {
    const user = c.get('user')!
    const { introduction } = c.req.valid('json')
    await db.user.update({
      where: { id: user.id },
      data: { introduction: introduction.trim() },
    })
    return c.json({ ok: true, data: { introduction: introduction.trim() } })
  },
)

// ─── POST /profile/photo — set photo URL directly ────────────────────────────
const profilePhotoSchema = z.object({
  url: z.string().min(1),
})

meRoute.post(
  '/profile/photo',
  requireRole('RESIDENT', 'VISITOR'),
  zValidator('json', profilePhotoSchema),
  async (c) => {
    const user = c.get('user')!
    const { url } = c.req.valid('json')
    await db.user.update({
      where: { id: user.id },
      data: { profilePhotoUrl: url },
    })
    return c.json({ ok: true, data: { profilePhotoUrl: url } })
  },
)

// ─── POST /profile/photo-upload — set storage key + return signed URL ────────
const profilePhotoUploadSchema = z.object({
  storageKey: z.string().min(1),
})

meRoute.post(
  '/profile/photo-upload',
  requireRole('RESIDENT', 'VISITOR'),
  zValidator('json', profilePhotoUploadSchema),
  async (c) => {
    const user = c.get('user')!
    const { storageKey } = c.req.valid('json')
    await db.user.update({
      where: { id: user.id },
      data: { profilePhotoUrl: storageKey },
    })
    const signedUrl = await getStorage().getSignedUrl(storageKey, 300)
    return c.json({ ok: true, data: { signedUrl } })
  },
)
