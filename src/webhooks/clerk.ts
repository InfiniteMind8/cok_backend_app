import { Hono } from 'hono'
import type { AppEnv } from '../server.js'
import { env } from '../lib/env.js'
import { ApiError } from '../lib/api-error.js'

/**
 * Clerk webhook handler. Port from website/app/api/webhooks/clerk/route.ts.
 *
 * IMPORTANT (preserve from Phase 1+ D.13):
 *   - Verify svix signature using CLERK_WEBHOOK_SECRET BEFORE any side effect
 *   - Idempotency check via WebhookEvent table (svix-id is the dedupe key)
 *   - On user.deleted: SOFT-delete by setting deactivatedAt + deactivationReason
 *     (NEVER hard-delete; FK references in AuditLog must remain valid)
 *   - Return 401 on bad signature, 200 on duplicate (already processed),
 *     201 on first successful processing, 500 on internal error so Clerk retries
 *
 * Reference port source:
 *   website/app/api/webhooks/clerk/route.ts
 *   website/app/api/webhooks/clerk/__tests__/route.test.ts (7 tests to mirror)
 */
export const clerkWebhookRoute = new Hono<AppEnv>()

clerkWebhookRoute.post('/', async (c) => {
  if (!env.CLERK_WEBHOOK_SECRET) {
    throw new ApiError(
      'INTERNAL_ERROR',
      'CLERK_WEBHOOK_SECRET not configured — refusing to accept webhooks',
    )
  }

  // TODO(phase2-B.4): port full implementation from
  // website/app/api/webhooks/clerk/route.ts. The current stub returns 501
  // so Clerk retries don't cause silent data loss.
  return c.json(
    {
      ok: false,
      error: { code: 'INTERNAL_ERROR' as const, message: 'Webhook handler not yet ported (phase2-B.4)' },
    },
    501,
  )
})
