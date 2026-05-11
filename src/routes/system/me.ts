import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { AppEnv } from '../../server.js'
import { ApiError } from '../../lib/api-error.js'
import { db } from '../../lib/db.js'
import { requireRole } from '../../middleware/auth.js'
import { clerkClient } from '../../lib/clerk.js'
import { getStorage } from '../../lib/storage/driver.js'
import { getActiveEmergencyBroadcasts } from '../../lib/queries/broadcast.js'
import { getTourStatus } from '../../lib/queries/tour.js'
import { getUserActiveGroups } from '../../lib/queries/visitor-groups.js'

export const meRoute = new Hono<AppEnv>()

// ─── GET /tour-status — should the onboarding tour show? ─────────────────────
meRoute.get('/tour-status', async (c) => {
  const user = c.get('user')!
  const status = await getTourStatus(user.id)
  return c.json({ ok: true, data: status })
})

// ─── GET /broadcasts/active — unacknowledged emergency broadcasts ────────────
// Drives the persistent banner at the top of the resident UI.
meRoute.get('/broadcasts/active', async (c) => {
  const user = c.get('user')!
  const broadcasts = await getActiveEmergencyBroadcasts(user.id)
  return c.json({ ok: true, data: broadcasts })
})

// ─── GET /visitor-groups — caller's active visitor-group memberships ─────────
// Used by the resident community page when the caller is a VISITOR. Returns
// the group rows (not memberships), already filtered to non-archived.
meRoute.get('/visitor-groups', async (c) => {
  const user = c.get('user')!
  const groups = await getUserActiveGroups(user.id)
  return c.json({ ok: true, data: groups })
})

// ─── GET /rates/active — every conversion rate currently in effect ───────────
// Available to any authenticated caller; the resident wallet page uses it
// to render display-currency conversions. Mirrors /v1/admin/rates/active.
meRoute.get('/rates/active', async (c) => {
  const now = new Date()
  const rows = await db.conversionRate.findMany({
    where: {
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    select: { baseCurrency: true, quoteCurrency: true, rate: true },
  })
  const map: Record<string, string> = {}
  for (const row of rows) {
    map[`${row.baseCurrency}_${row.quoteCurrency}`] = row.rate.toString()
  }
  map['KCRD_KCRD'] = '1'
  map['USD_USD'] = '1'
  map['GYD_GYD'] = '1'
  return c.json({ ok: true, data: map })
})

// ─── GET /profile — extended profile bundle for the resident profile page ───
// Adds kyc/status/introduction/twoFactorEnabled + a resolved signed URL for
// the profile photo when stored as a storage key. The website's profile page
// renders straight from this payload.
meRoute.get('/profile', async (c) => {
  const user = c.get('user')!
  const fullUser = await db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      clerkId: true,
      email: true,
      fullName: true,
      memberId: true,
      role: true,
      status: true,
      profilePhotoUrl: true,
      introduction: true,
      kyc: true,
      createdAt: true,
      displayCurrency: true,
      foundingMember: true,
    },
  })
  if (!fullUser) throw ApiError.notFound('User record missing')

  let profilePhotoSignedUrl: string | null = null
  if (fullUser.profilePhotoUrl) {
    if (fullUser.profilePhotoUrl.startsWith('http')) {
      profilePhotoSignedUrl = fullUser.profilePhotoUrl
    } else {
      profilePhotoSignedUrl = await getStorage()
        .getSignedUrl(fullUser.profilePhotoUrl, 300)
        .catch(() => null)
    }
  }

  let twoFactorEnabled = false
  if (fullUser.clerkId) {
    try {
      const clerkUser = await clerkClient.users.getUser(fullUser.clerkId)
      twoFactorEnabled = clerkUser.twoFactorEnabled
    } catch {
      // non-fatal — keep default false
    }
  }

  return c.json({
    ok: true,
    data: {
      ...fullUser,
      createdAt: fullUser.createdAt.toISOString(),
      profilePhotoSignedUrl,
      twoFactorEnabled,
    },
  })
})

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
