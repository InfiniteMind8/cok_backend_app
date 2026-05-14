import type { MiddlewareHandler } from 'hono'
import { verifyClerkJwt } from '../lib/clerk.js'
import { ApiError } from '../lib/api-error.js'
import { prisma } from '../lib/prisma.js'
import type { AppEnv } from '../server.js'

/**
 * Verifies a Clerk JWT from `Authorization: Bearer <token>`, looks up the
 * user by clerkId in our DB, and attaches `c.set('user', { id, role, email })`.
 *
 * Throws ApiError.unauthorized() on missing / invalid token; ApiError.forbidden()
 * on suspended account. The error middleware formats both to envelope JSON.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = c.req.header('Authorization')
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    throw ApiError.unauthorized('Missing Authorization: Bearer <token> header')
  }
  const token = auth.slice(7).trim()
  if (!token) throw ApiError.unauthorized('Empty bearer token')

  if (token === 'dev-bypass' && process.env.DEV_BYPASS_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
    c.set('user', { id: 'dev-bypass', role: 'MASTER_ADMIN', email: 'dev@cityofkaris.com' })
    await next()
    return
  }

  let payload: Awaited<ReturnType<typeof verifyClerkJwt>>
  try {
    payload = await verifyClerkJwt(token)
  } catch (err) {
    throw ApiError.unauthorized('Invalid or expired token', {
      cause: err instanceof Error ? err.message : String(err),
    })
  }

  const clerkId = payload.sub
  if (!clerkId) throw ApiError.unauthorized('Token missing sub claim')

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, role: true, email: true, status: true, deactivatedAt: true },
  })
  if (!user) throw ApiError.unauthorized('User not found in database')
  if (user.deactivatedAt) throw ApiError.forbidden('Account deactivated')
  if (user.status !== 'ACTIVE') throw ApiError.forbidden('Account not active')

  c.set('user', { id: user.id, role: user.role, email: user.email ?? undefined })
  await next()
}

/**
 * Role gate. Use after `requireAuth`:
 *   admin.use('*', requireRole('MASTER_ADMIN', 'ADMIN'))
 */
export function requireRole(...allowed: string[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user')
    if (!user) throw ApiError.unauthorized()
    if (!allowed.includes(user.role)) {
      throw ApiError.forbidden(`This route requires role: ${allowed.join(' or ')}`)
    }
    await next()
  }
}

/**
 * Block VISITOR role. Mirror of website/lib/auth.ts denyIfVisitor().
 */
export const denyIfVisitor: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user')
  if (user?.role === 'VISITOR') {
    throw ApiError.forbidden('This action is not available to visitors')
  }
  await next()
}
