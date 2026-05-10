import { Hono } from 'hono'
import type { AppEnv } from '../../server.js'

/**
 * Resident router. Mounts /v1/resident/* sub-routes. No role gate at the
 * router level — individual routes apply `denyIfVisitor` where needed.
 *
 * SUB-ROUTES TO IMPLEMENT (Phase 2 Block B.3 — port from website/app/(resident)/_actions/):
 *   - wallet              POST /wallet/transfer    POST /wallet/redeem-voucher    POST /wallet/settle
 *                         POST /wallet/exchange   GET  /wallet/transactions
 *   - profile             POST /profile/update     POST /profile/photo            POST /profile/display-currency
 *   - community           POST /community/announcements/:id/acknowledge  POST /community/votes
 *                         POST /community/issues/create
 *   - property            POST /property/extension-request   GET  /property/tenancy
 */
export const residentRouter = new Hono<AppEnv>()

// TODO(phase2-B.3): mount sub-routes as they're ported.

residentRouter.get('/', (c) =>
  c.json({
    ok: true,
    data: {
      message:
        'resident router is mounted but no sub-routes are wired yet — see TODO(phase2-B.3) in src/routes/resident/index.ts',
    },
  }),
)
