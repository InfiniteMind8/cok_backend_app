import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../server.js'
import { env } from '../../lib/env.js'
import { ApiError } from '../../lib/api-error.js'
import { createAuditEntry } from '../../lib/audit/index.js'
import { getDemoAccount } from '../../lib/demo-mode.js'
import { InMemoryRatelimit } from '../../lib/rate-limit/index.js'

// Demo-only Clerk sign-in token mint. Strictly disabled in production —
// returns 404 there. Per-IP rate-limited (10 mints / 15 min).

const requestSchema = z.object({
  userId: z.string().regex(/^user_/, 'Must be a Clerk user id'),
})

const demoTokenMintLimiter = new InMemoryRatelimit(10, 900 * 1000)
const DEMO_TOKEN_MINT_SCOPE = 'demo-token-mint'

function getClientIp(c: { req: { header: (k: string) => string | undefined } }): string {
  const forwardedFor = c.req.header('x-forwarded-for')
  const firstForwardedIp = forwardedFor?.split(',')[0]?.trim()
  return firstForwardedIp || c.req.header('x-real-ip') || 'unknown'
}

export const authRoute = new Hono<AppEnv>()

authRoute.post('/token', async (c) => {
  if (env.NODE_ENV === 'production') {
    throw ApiError.notFound()
  }

  const body = await c.req.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    throw ApiError.validation('Invalid request', parsed.error.issues)
  }

  const { userId } = parsed.data
  const rateLimit = await demoTokenMintLimiter.limit(
    `${DEMO_TOKEN_MINT_SCOPE}:${getClientIp(c)}`,
  )

  if (!rateLimit.success) {
    const retryAfter = Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1000))
    c.header('Retry-After', String(retryAfter))
    throw ApiError.rateLimited('Too many requests')
  }

  const account = getDemoAccount(userId)
  if (!account) {
    throw ApiError.forbidden('Not a demo account')
  }

  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
  })
  const data = (await res.json()) as { token?: string }

  if (!data.token) {
    throw new ApiError('INTERNAL_ERROR', 'Token generation failed')
  }

  await createAuditEntry({
    action: 'DEMO_TOKEN_MINT',
    entity: 'DemoSession',
    entityId: userId,
    actorId: userId,
    after: {
      requestedUserId: userId,
      name: account.name,
      role: account.role,
    },
  })

  return c.json({ ok: true, data: { token: data.token } })
})
