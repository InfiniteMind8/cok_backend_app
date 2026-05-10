import { Hono } from 'hono'
import { Webhook } from 'svix'
import type { AppEnv } from '../server.js'
import { db } from '../lib/db.js'
import { env } from '../lib/env.js'
import { clerkClient } from '../lib/clerk.js'
import { generateUniqueMemberId } from '../lib/member-id.js'
import { captureException } from '../lib/sentry.js'
import { ApiError } from '../lib/api-error.js'

type ClerkUserCreatedEvent = {
  type: 'user.created'
  data: {
    id: string
    email_addresses: Array<{ email_address: string; id: string }>
    primary_email_address_id: string
    first_name: string | null
    last_name: string | null
    image_url: string | null
  }
}

type ClerkUserUpdatedEvent = {
  type: 'user.updated'
  data: {
    id: string
    email_addresses: Array<{ email_address: string; id: string }>
    primary_email_address_id: string
    first_name: string | null
    last_name: string | null
    image_url: string | null
  }
}

type ClerkUserDeletedEvent = {
  type: 'user.deleted'
  data: {
    id: string
    deleted: boolean
  }
}

type ClerkWebhookEvent =
  | ClerkUserCreatedEvent
  | ClerkUserUpdatedEvent
  | ClerkUserDeletedEvent

function getPrimaryEmail(data: ClerkUserCreatedEvent['data']): string {
  const primary = data.email_addresses.find((e) => e.id === data.primary_email_address_id)
  return primary?.email_address ?? data.email_addresses[0]?.email_address ?? ''
}

function getFullName(data: ClerkUserCreatedEvent['data']): string {
  const parts = [data.first_name, data.last_name].filter(Boolean)
  return parts.join(' ') || 'Karis Member'
}

function isPrismaUniqueViolation(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: unknown }).code === 'P2002',
  )
}

export const clerkWebhookRoute = new Hono<AppEnv>()

clerkWebhookRoute.post('/', async (c) => {
  if (!env.CLERK_WEBHOOK_SECRET) {
    throw new ApiError(
      'INTERNAL_ERROR',
      'CLERK_WEBHOOK_SECRET not configured — refusing to accept webhooks',
    )
  }

  const svixId = c.req.header('svix-id')
  const svixTimestamp = c.req.header('svix-timestamp')
  const svixSignature = c.req.header('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return c.text('Missing svix headers', 401)
  }

  const payload = await c.req.text()
  const wh = new Webhook(env.CLERK_WEBHOOK_SECRET)

  let event: ClerkWebhookEvent
  try {
    event = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkWebhookEvent
  } catch {
    return c.text('Invalid webhook signature', 401)
  }

  // Idempotency guard: webhookEvent.id is the svix-id (unique).
  // Race-safe: if a concurrent request inserts first, we get P2002 and 200.
  try {
    await db.webhookEvent.create({
      data: {
        id: svixId,
        source: 'clerk',
        type: event.type,
        payload: JSON.parse(payload),
        signatureValid: true,
        processedAt: new Date(),
      },
    })
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      return c.text('Already processed', 200)
    }
    throw err
  }

  try {
    if (event.type === 'user.created') {
      const { data } = event
      const email = getPrimaryEmail(data)
      const fullName = getFullName(data)

      const existingUser = await db.user.findUnique({ where: { email } })
      if (existingUser) {
        await db.user.update({
          where: { email },
          data: {
            clerkId: data.id,
            profilePhotoUrl: data.image_url ?? existingUser.profilePhotoUrl,
          },
        })
      } else {
        const memberId = await generateUniqueMemberId()

        await db.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              clerkId: data.id,
              memberId,
              email,
              fullName,
              role: 'VISITOR',
              status: 'PENDING_KYC',
              profilePhotoUrl: data.image_url,
            },
          })

          await tx.wallet.create({
            data: { userId: user.id },
          })
        })
      }
    } else if (event.type === 'user.updated') {
      const { data } = event
      const email = getPrimaryEmail(data)
      const fullName = getFullName(data)

      await db.user.updateMany({
        where: { clerkId: data.id },
        data: {
          email,
          fullName,
          profilePhotoUrl: data.image_url,
        },
      })
    } else if (event.type === 'user.deleted') {
      // Soft-delete: preserve the row for audit log FK integrity.
      await db.user.updateMany({
        where: { clerkId: event.data.id },
        data: {
          deactivatedAt: new Date(),
          deactivationReason: 'clerk_deleted',
        },
      })

      try {
        const sessions = await clerkClient.sessions
          .getSessionList({ userId: event.data.id })
          .catch(() => ({ data: [] as Array<{ id: string }> }))
        await Promise.all(
          sessions.data.map((s) => clerkClient.sessions.revokeSession(s.id).catch(() => {})),
        )
      } catch {
        // Clerk may have already deleted the user and invalidated sessions.
      }
    }
  } catch (err) {
    // Roll back the idempotency row so a Clerk retry will re-attempt.
    await db.webhookEvent.delete({ where: { id: svixId } }).catch(() => {})
    captureException(err, {
      route: 'webhooks/clerk',
      event_type: event.type,
      svix_id: svixId,
    })
    return c.text('Handler error', 500)
  }

  return c.text('OK', 200)
})
