import { createHash } from 'node:crypto'
import { Hono } from 'hono'
import { format } from 'date-fns'
import JSZip from 'jszip'
import { AttachmentEntityType } from '@prisma/client'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { env } from '../../lib/env.js'
import { ApiError } from '../../lib/api-error.js'
import { clerkClient } from '../../lib/clerk.js'
import { sendEmail } from '../../lib/email/service.js'
import { getAttachmentsByEntity } from '../../lib/storage/attachments.js'
import {
  getDirectoryTree,
  getIssueEntityDetail,
  getLeaseEntityDetail,
  getPropertyEntityDetail,
  getUserEntityDetail,
} from '../../lib/queries/data-directory.js'

export const dataDirectoryRoute = new Hono<AppEnv>()

// ─── GET /tree — directory tree with optional search ─────────────────────────
dataDirectoryRoute.get('/tree', async (c) => {
  const search = c.req.query('search')
  const tree = await getDirectoryTree(search)
  return c.json({ ok: true, data: tree })
})

// ─── GET /entity/:type/:id — full entity detail ──────────────────────────────
// Type is one of: User | Property | Lease | Issue. Lib functions return null
// when not found; surface as 404.
dataDirectoryRoute.get('/entity/:type/:id', async (c) => {
  const type = c.req.param('type')
  const id = c.req.param('id')

  let entity: unknown
  switch (type) {
    case 'User':
      entity = await getUserEntityDetail(id)
      break
    case 'Property':
      entity = await getPropertyEntityDetail(id)
      break
    case 'Lease':
      entity = await getLeaseEntityDetail(id)
      break
    case 'Issue':
      entity = await getIssueEntityDetail(id)
      break
    default:
      throw ApiError.validation(`Unknown entity type: ${type}`)
  }

  if (!entity) throw ApiError.notFound(`${type} not found`)
  return c.json({ ok: true, data: entity })
})

// ─── POST /users/:userId/reset-mfa ───────────────────────────────────────────
// Forces a Clerk MFA reset for the target user. Records an audit row, then
// emails the user with the enrolment link. The Clerk call is the side that
// must succeed; if it fails we surface the error rather than hiding it
// behind a try/catch.
dataDirectoryRoute.post('/users/:userId/reset-mfa', async (c) => {
  const actor = c.get('user')!
  const targetUserId = c.req.param('userId')

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, clerkId: true, fullName: true, email: true, role: true },
  })

  if (!target) throw ApiError.notFound('User not found')
  if (!target.clerkId) {
    throw ApiError.validation('User has no linked Clerk account')
  }

  try {
    await clerkClient.users.disableUserMFA(target.clerkId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new ApiError('INTERNAL_ERROR', `Clerk MFA reset failed: ${message}`)
  }

  const resetAt = format(new Date(), 'yyyy-MM-dd HH:mm:ss zzz')

  await db.auditLog.create({
    data: {
      action: 'RESET_MFA',
      entity: 'User',
      entityId: target.id,
      actorId: actor.id,
      after: {
        targetUserId: target.id,
        targetEmail: target.email,
        actorId: actor.id,
        resetAt,
      },
    },
  })

  // Best-effort email — Clerk reset has already succeeded.
  // Note: actor's fullName isn't on the JWT-derived user; fetch from DB.
  const actorRow = await db.user.findUnique({
    where: { id: actor.id },
    select: { fullName: true },
  })

  sendEmail({
    to: target.email,
    subject: 'Your two-factor authentication has been reset',
    template: 'mfa-reset',
    data: {
      recipientName: target.fullName,
      resetByAdminName: actorRow?.fullName ?? 'an administrator',
      resetAt,
      enrollUrl: `${env.APP_URL}/account/mfa-enroll`,
    },
    idempotencyKey: `mfa-reset-${target.id}-${Date.now()}`,
  }).catch(() => {})

  return c.json({ ok: true, data: { userId: target.id, resetAt } })
})

// GET /v1/admin/data-directory/export/:userId
// Exports a user's complete record (profile, ledger, attachments) as a
// ZIP with a SHA256 manifest. MASTER_ADMIN-gated by the parent router.
dataDirectoryRoute.get('/export/:userId', async (c) => {
  const actor = c.get('user')!
  const userId = c.req.param('userId')

  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      wallet: { select: { id: true } },
      ownedProperties: { include: { property: { select: { code: true, type: true } } } },
      rentedProperties: { include: { property: { select: { code: true, type: true } } } },
      visitorProfile: true,
      vendorProfile: true,
    },
  })

  if (!user) throw ApiError.notFound('User not found')

  const attachments = await getAttachmentsByEntity(AttachmentEntityType.USER, userId)

  const ledgerEntries = user.wallet
    ? await db.ledgerEntry.findMany({
        where: { walletId: user.wallet.id },
        include: { transaction: { select: { type: true, description: true, createdAt: true } } },
        orderBy: { createdAt: 'desc' },
      })
    : []

  const zip = new JSZip()

  const userJson = JSON.stringify(
    {
      ...user,
      wallet: user.wallet ? { id: user.wallet.id } : null,
    },
    null,
    2,
  )
  zip.file('user.json', userJson)
  const userHash = createHash('sha256').update(userJson).digest('hex')

  zip.file('ledger.json', JSON.stringify(ledgerEntries, null, 2))

  const attachmentFolder = zip.folder('attachments')!
  const manifestEntries: Array<{
    id: string
    name: string
    mimeType: string
    storageKey: string
    status: 'ok' | 'error'
    error?: string
    hash?: string
  }> = []

  for (const att of attachments) {
    try {
      const res = await fetch(att.storageKey)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      const bytes = new Uint8Array(buf)
      const attHash = createHash('sha256').update(bytes).digest('hex')
      attachmentFolder.file(att.name, bytes)
      manifestEntries.push({
        id: att.id,
        name: att.name,
        mimeType: att.mimeType,
        storageKey: att.storageKey,
        status: 'ok',
        hash: attHash,
      })
    } catch (err) {
      manifestEntries.push({
        id: att.id,
        name: att.name,
        mimeType: att.mimeType,
        storageKey: att.storageKey,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const manifest = {
    userId,
    exportedAt: new Date().toISOString(),
    actorId: actor.id,
    userJsonHash: userHash,
    attachments: manifestEntries,
  }
  const manifestJson = JSON.stringify(manifest, null, 2)
  const manifestHash = createHash('sha256').update(manifestJson).digest('hex')
  zip.file('manifest.json', manifestJson)

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

  await db.auditLog.create({
    data: {
      action: 'data_directory.export',
      entity: 'User',
      entityId: userId,
      actorId: actor.id,
      after: {
        targetUserId: userId,
        targetEmail: user.email,
        manifestHash,
        attachmentCount: attachments.length,
      },
    },
  })

  const filename = `user-export-${user.memberId}-${new Date().toISOString().slice(0, 10)}.zip`

  return new Response(new Uint8Array(zipBuffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
})
