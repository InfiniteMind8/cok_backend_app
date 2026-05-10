import { Hono } from 'hono'
import type { AppEnv } from '../../server.js'
import { requireRole } from '../../middleware/auth.js'

/**
 * Admin router. Mounts all /v1/admin/* sub-routes after enforcing the
 * MASTER_ADMIN / ADMIN role gate. Per Phase 1+ decision D-D4-01, ADMIN
 * is currently redirected from all admin routes — only MASTER_ADMIN gets
 * through. If/when ADMIN gains scoped admin access, expand the role list
 * here AND tighten per-route gates.
 *
 * SUB-ROUTES TO IMPLEMENT (Phase 2 Block B.3 — port from website/app/(admin)/_actions/):
 *   - accounts            POST /accounts/create        (admin/_actions/accounts.ts)
 *   - attachment          GET  /attachments/:id/url    POST /attachments/:id/delete
 *   - broadcast           POST /broadcasts/send        POST /broadcasts/:id/acknowledge
 *   - community           POST /community/updates      (admin/_actions/community.ts)
 *   - data-directory      POST /data-directory/users/:userId/reset-mfa    POST /data-directory/users/:userId/export
 *   - deposits            POST /deposits/record
 *   - email               POST /emails/resend
 *   - imports             POST /imports/members/parse  POST /imports/members/commit  ...
 *   - promotions          POST /promotions/activate    POST /promotions/deactivate
 *   - properties          POST /properties/create      POST /properties/update
 *   - property-transfers  POST /property-transfers/:id/approve   POST .../decline
 *   - rates               POST /rates/update
 *   - reconciliation      POST /reconciliation/run-now POST /reconciliation/:id/acknowledge
 *   - rental-extensions   POST /rental-extensions/:id/approve   POST .../decline
 *   - settings            POST /settings/fee-schedule POST /settings/wallet-floor
 *   - settlements         POST /settlements/:id/approve POST .../decline
 *   - tour                POST /tour/complete          POST /tour/dismiss
 *   - treasury            POST /treasury/wallets/:id/floor
 *   - visitor-groups      POST /visitor-groups/create  POST .../assign-member  ...
 *   - voucher-requests    POST /voucher-requests/:id/approve  POST .../decline
 *   - vouchers            POST /vouchers/issue         POST /vouchers/redeem
 *
 * Each sub-route should export a Hono<AppEnv> instance and be mounted here
 * via .route(). Use @hono/zod-validator with schemas from the shared types.
 */
import { auditLogRoute } from './audit-log.js'
import { dataDirectoryRoute } from './data-directory.js'
import { settlementsRoute } from './settlements.js'
import { voucherRequestsRoute } from './voucher-requests.js'
import { propertyTransfersRoute } from './property-transfers.js'
import { rentalExtensionsRoute } from './rental-extensions.js'
import { depositsRoute } from './deposits.js'
import { treasuryRoute } from './treasury.js'
import { vouchersRoute } from './vouchers.js'
import { reconciliationRoute } from './reconciliation.js'
import { accountsRoute } from './accounts.js'
import { adminAttachmentsRoute } from './attachments.js'

export const adminRouter = new Hono<AppEnv>()

adminRouter.use('*', requireRole('MASTER_ADMIN'))

// Phase 2 — exporters ported from website/app/api/admin/*.
adminRouter.route('/audit-log', auditLogRoute)
adminRouter.route('/data-directory', dataDirectoryRoute)

// Phase 3 batch 1 — approvals/decisions ported from website/_actions/*.
adminRouter.route('/settlements', settlementsRoute)
adminRouter.route('/voucher-requests', voucherRequestsRoute)
adminRouter.route('/property-transfers', propertyTransfersRoute)
adminRouter.route('/rental-extensions', rentalExtensionsRoute)

// Phase 3 batch 2 — treasury/ledger ported from website/_actions/*.
adminRouter.route('/deposits', depositsRoute)
adminRouter.route('/treasury', treasuryRoute)
adminRouter.route('/vouchers', vouchersRoute)
adminRouter.route('/reconciliation', reconciliationRoute)

// Phase 3 batch 3 — accounts + admin-side attachment management.
// (data-directory MFA reset is on dataDirectoryRoute itself; attachment URL
// retrieval is at /v1/attachments/:id/url since it allows the uploader too.)
adminRouter.route('/accounts', accountsRoute)
adminRouter.route('/attachments', adminAttachmentsRoute)

adminRouter.get('/', (c) =>
  c.json({
    ok: true,
    data: {
      message:
        'admin router live. Mounted: /audit-log, /data-directory, /settlements, ' +
        '/voucher-requests, /property-transfers, /rental-extensions, /deposits, ' +
        '/treasury, /vouchers, /reconciliation, /accounts, /attachments.',
    },
  }),
)
