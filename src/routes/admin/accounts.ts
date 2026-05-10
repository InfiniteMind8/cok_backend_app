import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { Role, AccountStatus, AttachmentEntityType } from '@prisma/client'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { env } from '../../lib/env.js'
import { ApiError } from '../../lib/api-error.js'
import { clerkClient } from '../../lib/clerk.js'
import { sendEmail } from '../../lib/email/service.js'
import { generateUniqueMemberId } from '../../lib/member-id.js'
import { getUsers, getUserDetail, getAllUsersForSelect } from '../../lib/queries/accounts.js'

export const accountsRoute = new Hono<AppEnv>()

// ─── GET / — paginated list with filters ─────────────────────────────────────
accountsRoute.get('/', async (c) => {
  const filters = {
    role: (c.req.query('role') as Role | undefined) ?? undefined,
    status: (c.req.query('status') as AccountStatus | undefined) ?? undefined,
    search: c.req.query('search'),
    page: c.req.query('page') ? parseInt(c.req.query('page')!, 10) : undefined,
    pageSize: c.req.query('pageSize') ? parseInt(c.req.query('pageSize')!, 10) : undefined,
  }
  const { users, total } = await getUsers(filters)
  return c.json({
    ok: true,
    data: {
      users: users.map((u) => ({
        ...u,
        walletBalance: u.walletBalance?.toString() ?? null,
      })),
      total,
    },
  })
})

// ─── GET /select — minimal user list for select inputs ───────────────────────
accountsRoute.get('/select', async (c) => {
  const users = await getAllUsersForSelect()
  return c.json({ ok: true, data: users })
})

// ─── GET /:id — full account detail ──────────────────────────────────────────
accountsRoute.get('/:id', async (c) => {
  const userId = c.req.param('id')
  const user = await getUserDetail(userId)
  if (!user) throw ApiError.notFound('User not found')
  return c.json({
    ok: true,
    data: { ...user, walletBalance: user.walletBalance?.toString() ?? null },
  })
})

// ─── Schemas ─────────────────────────────────────────────────────────────────

const attachmentInputSchema = z.object({
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  name: z.string().min(1),
  fieldName: z.string().min(1),
})

const residentFieldsSchema = z.object({
  preferredName: z.string().optional(),
  gender: z.string().optional(),
  nationalIdType: z.string().optional(),
  nationalIdNumber: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  householdSize: z.number().int().optional(),
  vehiclePlates: z.array(z.string()).optional(),
  notes: z.string().optional(),
})

const visitorFieldsSchema = z.object({
  nationalIdType: z.string().optional(),
  nationalIdNumber: z.string().optional(),
  visitPurpose: z.string().optional(),
  expectedArrival: z.string().optional(),
  expectedDeparture: z.string().optional(),
  hostId: z.string().optional(),
})

const vendorFieldsSchema = z.object({
  businessName: z.string().optional(),
  businessCategory: z.string().optional(),
  payoutMethod: z.string().optional(),
  kcrdWalletPreference: z.boolean().optional(),
  notes: z.string().optional(),
})

const createAccountSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['MASTER_ADMIN', 'ADMIN', 'VENDOR', 'RESIDENT', 'VISITOR']),
  preferredName: z.string().optional(),
  phone: z.string().optional(),
  gender: z.string().optional(),
  dob: z.string().optional(),
  govId: z.string().optional(),
  country: z.string().optional(),
  residentFields: residentFieldsSchema.optional(),
  visitorFields: visitorFieldsSchema.optional(),
  vendorFields: vendorFieldsSchema.optional(),
  attachments: z.array(attachmentInputSchema).optional(),
  groupIds: z.array(z.string()).optional(),
})

// ─── POST / — create an account ──────────────────────────────────────────────
// Wraps the user, wallet, role-specific profile, attachments, and visitor
// group memberships in a single transaction. After the tx commits, sends a
// Clerk invitation and welcome email — both best-effort.
accountsRoute.post('/', zValidator('json', createAccountSchema), async (c) => {
  const actor = c.get('user')!
  const input = c.req.valid('json')

  const memberId = await generateUniqueMemberId()

  const user = await db.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        memberId,
        email: input.email,
        fullName: input.fullName,
        role: input.role as Role,
        status: 'PENDING_KYC',
        preferredName: input.preferredName?.trim() ?? null,
        phone: input.phone?.trim() ?? null,
        gender: input.gender?.trim() ?? null,
        nationalIdType:
          input.residentFields?.nationalIdType ?? input.visitorFields?.nationalIdType ?? null,
        nationalIdNumber:
          input.residentFields?.nationalIdNumber ?? input.visitorFields?.nationalIdNumber ?? null,
        emergencyContactName: input.residentFields?.emergencyContactName ?? null,
        emergencyContactPhone: input.residentFields?.emergencyContactPhone ?? null,
        householdSize: input.residentFields?.householdSize ?? null,
        vehiclePlates: input.residentFields?.vehiclePlates ?? [],
        notes: input.residentFields?.notes ?? input.vendorFields?.notes ?? null,
        kyc: {
          dob: input.dob ?? null,
          govId: input.govId ?? null,
          country: input.country ?? null,
        },
      },
    })

    await tx.wallet.create({ data: { userId: newUser.id } })

    if (input.role === 'VISITOR' && input.visitorFields) {
      await tx.visitorProfile.create({
        data: {
          userId: newUser.id,
          visitPurpose: input.visitorFields.visitPurpose ?? null,
          expectedArrival: input.visitorFields.expectedArrival
            ? new Date(input.visitorFields.expectedArrival)
            : null,
          expectedDeparture: input.visitorFields.expectedDeparture
            ? new Date(input.visitorFields.expectedDeparture)
            : null,
          hostId: input.visitorFields.hostId ?? null,
        },
      })
    }

    if (input.role === 'VENDOR' && input.vendorFields) {
      await tx.vendorProfile.create({
        data: {
          userId: newUser.id,
          businessName: input.vendorFields.businessName?.trim() ?? null,
          businessCategory: input.vendorFields.businessCategory ?? null,
          payoutMethod: input.vendorFields.payoutMethod ?? null,
          kcrdWalletPreference: input.vendorFields.kcrdWalletPreference ?? false,
        },
      })
    }

    if (input.attachments && input.attachments.length > 0) {
      for (const att of input.attachments) {
        await tx.attachment.create({
          data: {
            storageKey: att.storageKey,
            mimeType: att.mimeType,
            sizeBytes: BigInt(att.sizeBytes),
            name: att.name,
            entityType: AttachmentEntityType.USER,
            entityId: newUser.id,
            fieldName: att.fieldName,
            uploadedBy: actor.id,
          },
        })
      }
    }

    if (input.role === 'VISITOR' && input.groupIds && input.groupIds.length > 0) {
      await tx.visitorGroupMembership.createMany({
        data: input.groupIds.map((groupId) => ({
          groupId,
          userId: newUser.id,
          assignedById: actor.id,
        })),
      })
    }

    await tx.auditLog.create({
      data: {
        action: 'CREATE_ACCOUNT',
        entity: 'User',
        entityId: newUser.id,
        actorId: actor.id,
        after: { memberId, role: input.role, email: input.email },
      },
    })

    return newUser
  })

  // Best-effort post-commit side effects.
  try {
    await clerkClient.invitations.createInvitation({
      emailAddress: input.email,
      redirectUrl: `${env.APP_URL}/sign-up`,
      ignoreExisting: true,
    })
  } catch {
    // non-fatal — admin can re-invite manually
  }

  sendEmail({
    to: input.email,
    subject: 'Welcome to City of Karis',
    template: 'welcome',
    data: {
      fullName: input.fullName,
      memberId: user.memberId,
      role: input.role,
      loginUrl: `${env.APP_URL}/sign-in`,
    },
    idempotencyKey: `welcome:${user.id}`,
  }).catch(() => {})

  return c.json({ ok: true, data: { userId: user.id, memberId: user.memberId } })
})

// ─── POST /:id/suspend ───────────────────────────────────────────────────────
const suspendSchema = z.object({
  reason: z.string().min(1, 'Suspension reason is required'),
})

accountsRoute.post('/:id/suspend', zValidator('json', suspendSchema), async (c) => {
  const userId = c.req.param('id')
  // The original action used `reason` only as a guard; it's not persisted on
  // the User row. Preserved here for parity — caller-side logging is enough.
  c.req.valid('json')

  const target = await db.user.update({
    where: { id: userId },
    data: { status: 'SUSPENDED' },
  })

  // Revoke all live Clerk sessions so the suspension is enforced immediately.
  if (target.clerkId) {
    try {
      const sessions = await clerkClient.sessions.getSessionList({ userId: target.clerkId })
      await Promise.all(
        sessions.data.map((s) => clerkClient.sessions.revokeSession(s.id).catch(() => {})),
      )
    } catch {
      // non-fatal
    }
  }

  return c.json({ ok: true, data: { userId, status: 'SUSPENDED' } })
})

// ─── POST /:id/restore ───────────────────────────────────────────────────────
accountsRoute.post('/:id/restore', async (c) => {
  const userId = c.req.param('id')
  await db.user.update({
    where: { id: userId },
    data: { status: 'ACTIVE' },
  })
  return c.json({ ok: true, data: { userId, status: 'ACTIVE' } })
})

// ─── POST /:id/role ──────────────────────────────────────────────────────────
const upgradeRoleSchema = z.object({
  role: z.enum(['MASTER_ADMIN', 'ADMIN', 'VENDOR', 'RESIDENT', 'VISITOR']),
})

accountsRoute.post('/:id/role', zValidator('json', upgradeRoleSchema), async (c) => {
  const userId = c.req.param('id')
  const { role } = c.req.valid('json')
  await db.user.update({
    where: { id: userId },
    data: { role: role as Role },
  })
  return c.json({ ok: true, data: { userId, role } })
})
