import { Hono } from 'hono'
import { prisma } from '../../lib/prisma.js'
import type { AppEnv } from '../../server.js'

export const healthRoute = new Hono<AppEnv>()

healthRoute.get('/', async (c) => {
  // Liveness: respond regardless of DB.
  return c.json({ ok: true, service: 'cok-api', version: '0.1.0', time: new Date().toISOString() })
})

healthRoute.get('/ready', async (c) => {
  // Readiness: check DB connectivity.
  try {
    await prisma.$queryRaw`SELECT 1`
    return c.json({ ok: true, db: 'up' })
  } catch (err) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR' as const,
          message: 'Database not reachable',
          details: err instanceof Error ? err.message : String(err),
        },
      },
      503,
    )
  }
})
