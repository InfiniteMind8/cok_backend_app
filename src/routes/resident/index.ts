import { Hono } from 'hono'
import type { AppEnv } from '../../server.js'
import { residentCommunityRoute } from './community.js'
import { residentWalletRoute } from './wallet.js'
import { residentPropertyRoute } from './property.js'

/**
 * Resident router. Mounts /v1/resident/* sub-routes. No router-level role
 * gate — individual sub-routes apply `requireRole(...)` per endpoint.
 *
 * Profile and notification routes (display-currency, introduction, photo,
 * mark-all-read, tour) live under /v1/me, not here, because they're
 * scoped to the caller and don't depend on RESIDENT role.
 */
export const residentRouter = new Hono<AppEnv>()

residentRouter.route('/community', residentCommunityRoute)
residentRouter.route('/wallet', residentWalletRoute)
residentRouter.route('/property', residentPropertyRoute)

residentRouter.get('/', (c) =>
  c.json({
    ok: true,
    data: { message: 'resident router live. Mounted: /community, /wallet, /property.' },
  }),
)
