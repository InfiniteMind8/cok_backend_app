import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { env } from '../../lib/env.js'
import { ApiError } from '../../lib/api-error.js'
import { clerkClient } from '../../lib/clerk.js'
import { sendEmail } from '../../lib/email/service.js'
import { generateUniqueMemberId } from '../../lib/member-id.js'
import { createAttachment } from '../../lib/storage/attachments.js'
import { parseMembersSheet } from '../../lib/imports/members-parser.js'
import { parsePropertiesSheet } from '../../lib/imports/properties-parser.js'

export const importsRoute = new Hono<AppEnv>()

// MAX_IMPORT_ROWS comes from env (default 1000) so prod can lift the cap
// without redeploying.
const MAX_IMPORT_ROWS = env.IMPORT_MAX_ROWS

async function computeFileHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── Member import: parse + commit + cancel ──────────────────────────────────

importsRoute.post('/members/parse', async (c) => {
  const actor = c.get('user')!

  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    throw ApiError.validation('Invalid multipart body')
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    throw ApiError.validation('No file uploaded. Please attach an .xlsx file.')
  }
  if (!file.name.endsWith('.xlsx')) {
    throw ApiError.validation('Only .xlsx files are accepted.')
  }

  const buffer = await file.arrayBuffer()
  const fileHash = await computeFileHash(buffer)

  const existingEmailRows = await db.user.findMany({ select: { email: true } })
  const existingEmails = new Set(existingEmailRows.map((u) => u.email))

  const parsedRows = await parseMembersSheet(buffer, existingEmails)

  if (parsedRows.length === 0) {
    throw ApiError.validation(
      'The spreadsheet has no data rows. Check that the file uses the correct template.',
    )
  }
  if (parsedRows.length > MAX_IMPORT_ROWS) {
    throw ApiError.validation(
      `This file contains ${parsedRows.length} rows, which exceeds the limit of ${MAX_IMPORT_ROWS}. Split the file and import in batches.`,
    )
  }

  const validCount = parsedRows.filter((r) => r.status === 'VALID').length
  const warningCount = parsedRows.filter((r) => r.status === 'WARNING').length
  const errorCount = parsedRows.filter((r) => r.status === 'ERROR').length

  const session = await db.$transaction(async (tx) => {
    const s = await tx.importSession.create({
      data: {
        type: 'members',
        fileName: file.name,
        fileHash,
        totalRows: parsedRows.length,
        validCount,
        warningCount,
        errorCount,
        actorId: actor.id,
        status: 'UPLOADED',
      },
    })

    await tx.importRecord.createMany({
      data: parsedRows.map((row) => ({
        sessionId: s.id,
        rowNumber: row.rowNumber,
        rowData: row.rowData as object,
        status: row.status,
        messages: row.messages,
      })),
    })

    await tx.auditLog.create({
      data: {
        action: 'IMPORT_UPLOAD',
        entity: 'ImportSession',
        entityId: s.id,
        actorId: actor.id,
        after: {
          fileName: file.name,
          fileHash,
          totalRows: parsedRows.length,
          validCount,
          warningCount,
          errorCount,
        },
      },
    })

    return s
  })

  return c.json({
    ok: true,
    data: {
      sessionId: session.id,
      totalRows: parsedRows.length,
      validCount,
      warningCount,
      errorCount,
    },
  })
})

const commitMembersSchema = z.object({
  confirmedRowIds: z.array(z.string()),
})

importsRoute.post(
  '/members/:sessionId/commit',
  zValidator('json', commitMembersSchema),
  async (c) => {
    const actor = c.get('user')!
    const sessionId = c.req.param('sessionId')
    const { confirmedRowIds } = c.req.valid('json')

    const session = await db.importSession.findUnique({
      where: { id: sessionId },
      include: { rows: true },
    })
    if (!session) throw ApiError.notFound('Import session not found.')
    if (session.status !== 'UPLOADED') {
      throw ApiError.conflict(
        `This import session has already been ${session.status.toLowerCase()}.`,
      )
    }

    const confirmedSet = new Set(confirmedRowIds)
    const toProcess = session.rows.filter(
      (r) => r.status === 'VALID' || (r.status === 'WARNING' && confirmedSet.has(r.id)),
    )

    let committedCount = 0
    let skippedCount = 0

    for (const record of toProcess) {
      const rowData = record.rowData as Record<string, string>
      try {
        const memberId = await generateUniqueMemberId()

        const plates: string[] = rowData['vehicle_plates']
          ? rowData['vehicle_plates']
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean)
          : []

        const user = await db.$transaction(async (tx) => {
          const newUser = await tx.user.create({
            data: {
              memberId,
              email: rowData['email'] ?? '',
              fullName: rowData['full_name'] ?? '',
              role: 'RESIDENT',
              status: 'PENDING_KYC',
              preferredName: rowData['preferred_name'] || null,
              phone: rowData['phone_e164'] || null,
              gender: rowData['gender'] || null,
              nationalIdType: rowData['national_id_type'] || null,
              nationalIdNumber: rowData['national_id_number'] || null,
              emergencyContactName: rowData['emergency_contact_name'] || null,
              emergencyContactPhone: rowData['emergency_contact_phone'] || null,
              householdSize: rowData['household_size']
                ? parseInt(rowData['household_size'], 10) || null
                : null,
              vehiclePlates: plates,
              notes: rowData['notes'] || null,
              kyc: {
                dob: rowData['dob'] || null,
                govId: null,
                country: null,
              },
            },
          })

          await tx.wallet.create({ data: { userId: newUser.id } })

          await tx.auditLog.create({
            data: {
              action: 'IMPORT_CREATE_MEMBER',
              entity: 'User',
              entityId: newUser.id,
              actorId: actor.id,
              after: {
                memberId,
                email: rowData['email'],
                importSessionId: sessionId,
                importRowId: record.id,
              },
            },
          })

          return newUser
        })

        await db.importRecord.update({
          where: { id: record.id },
          data: { createdEntityId: user.id },
        })

        // Best-effort post-create side effects.
        try {
          await clerkClient.invitations.createInvitation({
            emailAddress: rowData['email'] ?? '',
            redirectUrl: `${env.APP_URL}/sign-up`,
            ignoreExisting: true,
          })
        } catch {
          // non-fatal
        }

        sendEmail({
          to: rowData['email'] ?? '',
          subject: 'Welcome to City of Karis',
          template: 'welcome',
          data: {
            fullName: rowData['full_name'] ?? '',
            memberId: user.memberId,
            role: 'RESIDENT',
            loginUrl: `${env.APP_URL}/sign-in`,
          },
          idempotencyKey: `welcome:${user.id}`,
        }).catch(() => {})

        committedCount++
      } catch {
        skippedCount++
      }
    }

    await db.importSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMMITTED',
        committedCount,
        skippedCount,
        completedAt: new Date(),
      },
    })

    await db.auditLog.create({
      data: {
        action: 'IMPORT_SESSION_COMMITTED',
        entity: 'ImportSession',
        entityId: sessionId,
        actorId: actor.id,
        after: {
          fileName: session.fileName,
          committedCount,
          skippedCount,
          totalProcessed: toProcess.length,
        },
      },
    })

    return c.json({ ok: true, data: { sessionId, committedCount, skippedCount } })
  },
)

importsRoute.post('/members/:sessionId/cancel', async (c) => {
  const actor = c.get('user')!
  const sessionId = c.req.param('sessionId')

  const session = await db.importSession.findUnique({ where: { id: sessionId } })
  if (!session) throw ApiError.notFound('Import session not found.')
  if (session.status !== 'UPLOADED') {
    throw ApiError.conflict('Only UPLOADED sessions can be cancelled.')
  }

  await db.importSession.update({
    where: { id: sessionId },
    data: { status: 'CANCELLED', completedAt: new Date() },
  })

  await db.auditLog.create({
    data: {
      action: 'IMPORT_SESSION_CANCELLED',
      entity: 'ImportSession',
      entityId: sessionId,
      actorId: actor.id,
      after: { fileName: session.fileName },
    },
  })

  return c.json({ ok: true, data: { sessionId } })
})

// ─── Property import: parse + commit + cancel ────────────────────────────────

interface AttachmentMeta {
  key: string
  name: string
  mimeType: string
  sizeBytes: number
  fieldName: string
}
type ZipAttachmentsMap = Record<string, AttachmentMeta[]>

function guessMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    pdf: 'application/pdf',
    gif: 'image/gif',
  }
  return map[ext] ?? 'application/octet-stream'
}

// Companion zip processing — deferred. The Phase 2 backend split intentionally
// does NOT depend on `uploadthing/server`; the website's property import zip
// uploaded each entry to UploadThing and embedded the resulting keys in the
// import session metadata. When the frontend rewrite (Phase 6) drops the
// UploadThing dependency in favour of /v1/attachments/upload, this function
// will switch to that endpoint instead.
//
// Until then: companion zips are accepted at parse time (so the upload UI
// keeps working) but produce no attachments. Properties imported via
// /properties/parse with a zip will commit without their photos/docs;
// admins can attach them after the fact via the regular attachment flow.
async function processCompanionZip(zipFile: File): Promise<ZipAttachmentsMap> {
  void zipFile
  // eslint-disable-next-line no-console
  console.warn(
    '[imports] companion zip processing is deferred — see processCompanionZip in routes/admin/imports.ts',
  )
  void guessMimeType // referenced for future restoration
  return {}
}

importsRoute.post('/properties/parse', async (c) => {
  const actor = c.get('user')!

  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    throw ApiError.validation('Invalid multipart body')
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    throw ApiError.validation('No file uploaded. Please attach an .xlsx file.')
  }
  if (!file.name.endsWith('.xlsx')) {
    throw ApiError.validation('Only .xlsx files are accepted.')
  }

  const zipFile = formData.get('zipFile')
  const hasZip = zipFile instanceof File && zipFile.size > 0

  if (hasZip && zipFile.size > 50 * 1024 * 1024) {
    throw ApiError.validation('Companion zip must be under 50 MB.')
  }

  const buffer = await file.arrayBuffer()
  const fileHash = await computeFileHash(buffer)

  const existingCodeRows = await db.property.findMany({ select: { code: true } })
  const existingCodes = new Set(existingCodeRows.map((p) => p.code))

  const parsedRows = await parsePropertiesSheet(buffer, existingCodes)

  if (parsedRows.length === 0) {
    throw ApiError.validation(
      'The spreadsheet has no data rows. Check that the file uses the correct template.',
    )
  }
  if (parsedRows.length > MAX_IMPORT_ROWS) {
    throw ApiError.validation(
      `This file contains ${parsedRows.length} rows, which exceeds the limit of ${MAX_IMPORT_ROWS}. Split the file and import in batches.`,
    )
  }

  const validCount = parsedRows.filter((r) => r.status === 'VALID').length
  const warningCount = parsedRows.filter((r) => r.status === 'WARNING').length
  const errorCount = parsedRows.filter((r) => r.status === 'ERROR').length

  let zipAttachments: ZipAttachmentsMap = {}
  if (hasZip) {
    zipAttachments = await processCompanionZip(zipFile)
  }

  const session = await db.$transaction(async (tx) => {
    const s = await tx.importSession.create({
      data: {
        type: 'properties',
        fileName: file.name,
        fileHash,
        totalRows: parsedRows.length,
        validCount,
        warningCount,
        errorCount,
        actorId: actor.id,
        status: 'UPLOADED',
        metadata: hasZip ? ({ zip_attachments: zipAttachments } as object) : undefined,
      },
    })

    await tx.importRecord.createMany({
      data: parsedRows.map((row) => ({
        sessionId: s.id,
        rowNumber: row.rowNumber,
        rowData: row.rowData as object,
        status: row.status,
        messages: row.messages,
      })),
    })

    await tx.auditLog.create({
      data: {
        action: 'IMPORT_UPLOAD',
        entity: 'ImportSession',
        entityId: s.id,
        actorId: actor.id,
        after: {
          type: 'properties',
          fileName: file.name,
          fileHash,
          totalRows: parsedRows.length,
          validCount,
          warningCount,
          errorCount,
          hasCompanionZip: hasZip,
        },
      },
    })

    return s
  })

  return c.json({
    ok: true,
    data: {
      sessionId: session.id,
      totalRows: parsedRows.length,
      validCount,
      warningCount,
      errorCount,
    },
  })
})

const commitPropertiesSchema = z.object({
  confirmedRowIds: z.array(z.string()),
})

importsRoute.post(
  '/properties/:sessionId/commit',
  zValidator('json', commitPropertiesSchema),
  async (c) => {
    const actor = c.get('user')!
    const sessionId = c.req.param('sessionId')
    const { confirmedRowIds } = c.req.valid('json')

    const session = await db.importSession.findUnique({
      where: { id: sessionId },
      include: { rows: true },
    })
    if (!session) throw ApiError.notFound('Import session not found.')
    if (session.status !== 'UPLOADED') {
      throw ApiError.conflict(
        `This import session has already been ${session.status.toLowerCase()}.`,
      )
    }

    const zipAttachments: ZipAttachmentsMap =
      (session.metadata as { zip_attachments?: ZipAttachmentsMap } | null)?.zip_attachments ?? {}

    const confirmedSet = new Set(confirmedRowIds)
    const toProcess = session.rows.filter(
      (r) => r.status === 'VALID' || (r.status === 'WARNING' && confirmedSet.has(r.id)),
    )

    let committedCount = 0
    let skippedCount = 0

    for (const record of toProcess) {
      const rowData = record.rowData as Record<string, string>
      try {
        const code =
          rowData['external_ref']?.trim() ||
          `IMP-${String(record.rowNumber - 1).padStart(4, '0')}`

        const address = [rowData['address_line_1'], rowData['address_line_2']]
          .filter(Boolean)
          .join(', ')

        const property = await db.$transaction(async (tx) => {
          const prop = await tx.property.create({
            data: {
              code,
              type: rowData['type'] as 'OWNERSHIP' | 'RENTAL' | 'ADMIN',
              category: 'RESIDENTIAL',
              address: address || null,
              lotNumber: rowData['lot_number'] || null,
              sizeSqm: rowData['size_sqm'] ? parseFloat(rowData['size_sqm']) : null,
              bedrooms: rowData['bedrooms'] ? parseInt(rowData['bedrooms'], 10) : null,
              bathrooms: rowData['bathrooms'] ? parseInt(rowData['bathrooms'], 10) : null,
              parkingSpots: rowData['parking_spots']
                ? parseInt(rowData['parking_spots'], 10)
                : null,
              yearBuilt: rowData['year_built'] ? parseInt(rowData['year_built'], 10) : null,
              propertyStatus:
                (rowData['status'] as 'VACANT' | 'OCCUPIED' | 'UNDER_CONSTRUCTION') || 'VACANT',
              totalPrice: rowData['purchase_price_kcrd']
                ? parseFloat(rowData['purchase_price_kcrd'])
                : null,
              currentValuationKcrd: rowData['current_valuation_kcrd']
                ? parseFloat(rowData['current_valuation_kcrd'])
                : null,
              notes: rowData['notes'] || null,
              specifications: {
                size_sqm: rowData['size_sqm'] || null,
                bedrooms: rowData['bedrooms'] || null,
                bathrooms: rowData['bathrooms'] || null,
                parking_spots: rowData['parking_spots'] || null,
                year_built: rowData['year_built'] || null,
              },
            },
          })

          await tx.auditLog.create({
            data: {
              action: 'IMPORT_CREATE_PROPERTY',
              entity: 'Property',
              entityId: prop.id,
              actorId: actor.id,
              after: {
                code,
                address,
                importSessionId: sessionId,
                importRowId: record.id,
              },
            },
          })

          return prop
        })

        await db.importRecord.update({
          where: { id: record.id },
          data: { createdEntityId: property.id },
        })

        const attachmentKey = rowData['external_ref']?.trim()
        if (attachmentKey && zipAttachments[attachmentKey]) {
          for (const att of zipAttachments[attachmentKey]) {
            await createAttachment({
              storageKey: att.key,
              mimeType: att.mimeType,
              sizeBytes: att.sizeBytes,
              name: att.name,
              entityType: 'PROPERTY',
              entityId: property.id,
              fieldName: att.fieldName,
              uploadedBy: actor.id,
            })
          }
        }

        committedCount++
      } catch {
        skippedCount++
      }
    }

    await db.importSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMMITTED',
        committedCount,
        skippedCount,
        completedAt: new Date(),
      },
    })

    await db.auditLog.create({
      data: {
        action: 'IMPORT_SESSION_COMMITTED',
        entity: 'ImportSession',
        entityId: sessionId,
        actorId: actor.id,
        after: {
          type: 'properties',
          fileName: session.fileName,
          committedCount,
          skippedCount,
          totalProcessed: toProcess.length,
        },
      },
    })

    return c.json({ ok: true, data: { sessionId, committedCount, skippedCount } })
  },
)

importsRoute.post('/properties/:sessionId/cancel', async (c) => {
  const actor = c.get('user')!
  const sessionId = c.req.param('sessionId')

  const session = await db.importSession.findUnique({ where: { id: sessionId } })
  if (!session) throw ApiError.notFound('Import session not found.')
  if (session.status !== 'UPLOADED') {
    throw ApiError.conflict('Only UPLOADED sessions can be cancelled.')
  }

  await db.importSession.update({
    where: { id: sessionId },
    data: { status: 'CANCELLED', completedAt: new Date() },
  })

  await db.auditLog.create({
    data: {
      action: 'IMPORT_SESSION_CANCELLED',
      entity: 'ImportSession',
      entityId: sessionId,
      actorId: actor.id,
      after: { type: 'properties', fileName: session.fileName },
    },
  })

  return c.json({ ok: true, data: { sessionId } })
})
