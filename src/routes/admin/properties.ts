import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  AttachmentEntityType,
  type PropertyType,
  type PropertyCategory,
  type PropertyStatus,
} from '@prisma/client'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'

export const propertiesRoute = new Hono<AppEnv>()

// ─── POST / — create a property ──────────────────────────────────────────────
const attachmentInputSchema = z.object({
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  name: z.string().min(1),
  fieldName: z.string().min(1),
})

const createPropertySchema = z.object({
  code: z.string().min(1),
  type: z.enum(['OWNERSHIP', 'RENTAL', 'ADMIN']),
  category: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'AMENITY', 'COMMON']),
  address: z.string().optional(),
  addressLine2: z.string().optional(),
  lotNumber: z.string().optional(),
  totalPrice: z.string().optional(),
  currentValuationKcrd: z.string().optional(),
  sizeSqm: z.string().optional(),
  bedrooms: z.string().optional(),
  bathrooms: z.string().optional(),
  parkingSpots: z.string().optional(),
  yearBuilt: z.string().optional(),
  propertyStatus: z.enum(['VACANT', 'OCCUPIED', 'UNDER_CONSTRUCTION']).optional(),
  notes: z.string().optional(),
  specifications: z.record(z.string(), z.string()).optional(),
  photos: z.array(z.string()).optional(),
  attachments: z.array(attachmentInputSchema).optional(),
})

propertiesRoute.post('/', zValidator('json', createPropertySchema), async (c) => {
  const actor = c.get('user')!
  const input = c.req.valid('json')

  const property = await db.$transaction(async (tx) => {
    const prop = await tx.property.create({
      data: {
        code: input.code.trim().toUpperCase(),
        type: input.type as PropertyType,
        category: input.category as PropertyCategory,
        address: input.address?.trim() ?? null,
        totalPrice: input.totalPrice ? input.totalPrice : null,
        currentValuationKcrd: input.currentValuationKcrd ? input.currentValuationKcrd : null,
        specifications: input.specifications ?? {},
        photos: input.photos ?? [],
        lotNumber: input.lotNumber?.trim() ?? null,
        sizeSqm: input.sizeSqm ? input.sizeSqm : null,
        bedrooms: input.bedrooms ? parseInt(input.bedrooms, 10) : null,
        bathrooms: input.bathrooms ? parseInt(input.bathrooms, 10) : null,
        parkingSpots: input.parkingSpots ? parseInt(input.parkingSpots, 10) : null,
        yearBuilt: input.yearBuilt ? parseInt(input.yearBuilt, 10) : null,
        propertyStatus: (input.propertyStatus ?? 'VACANT') as PropertyStatus,
        notes: input.notes?.trim() ?? null,
      },
    })

    if (input.attachments && input.attachments.length > 0) {
      for (const att of input.attachments) {
        await tx.attachment.create({
          data: {
            storageKey: att.storageKey,
            mimeType: att.mimeType,
            sizeBytes: BigInt(att.sizeBytes),
            name: att.name,
            entityType: AttachmentEntityType.PROPERTY,
            entityId: prop.id,
            fieldName: att.fieldName,
            uploadedBy: actor.id,
          },
        })
      }
    }

    await tx.auditLog.create({
      data: {
        action: 'CREATE_PROPERTY',
        entity: 'Property',
        entityId: prop.id,
        actorId: actor.id,
        after: { code: prop.code, type: prop.type, category: prop.category },
      },
    })

    return prop
  })

  return c.json({ ok: true, data: { propertyId: property.id } })
})

// ─── POST /:propertyId/installments — add an installment ─────────────────────
const installmentSchema = z.object({
  number: z.number().int().positive(),
  dueDate: z.string().min(1),
  amount: z.string().min(1),
  progressNote: z.string().optional(),
})

propertiesRoute.post(
  '/:propertyId/installments',
  zValidator('json', installmentSchema),
  async (c) => {
    const propertyId = c.req.param('propertyId')
    const input = c.req.valid('json')

    const created = await db.propertyInstallment.create({
      data: {
        propertyId,
        number: input.number,
        dueDate: new Date(input.dueDate),
        amount: input.amount,
        progressNote: input.progressNote?.trim() ?? null,
      },
    })

    return c.json({ ok: true, data: { installmentId: created.id } })
  },
)

// ─── POST /:propertyId/owner — assign a property owner ───────────────────────
const ownerSchema = z.object({
  userId: z.string().min(1),
  ownershipPct: z.number(),
  contractDate: z.string().min(1),
  contractUrl: z.string().optional(),
})

propertiesRoute.post(
  '/:propertyId/owner',
  zValidator('json', ownerSchema),
  async (c) => {
    const propertyId = c.req.param('propertyId')
    const input = c.req.valid('json')

    const created = await db.propertyOwnership.create({
      data: {
        propertyId,
        userId: input.userId,
        ownershipPct: input.ownershipPct,
        contractDate: new Date(input.contractDate),
        contractUrl: input.contractUrl ?? null,
      },
    })

    return c.json({ ok: true, data: { ownershipId: created.id } })
  },
)

// ─── POST /:propertyId/tenant — assign a tenant + optional lease attachment ──
const tenantSchema = z.object({
  userId: z.string().min(1),
  cycle: z.string().min(1),
  cyclePayment: z.string().min(1),
  contractDate: z.string().min(1),
  contractUrl: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  depositAmount: z.string().optional(),
  leaseAgreementKey: z.string().optional(),
  leaseAgreementName: z.string().optional(),
  leaseAgreementSize: z.number().optional(),
  leaseAgreementMime: z.string().optional(),
})

propertiesRoute.post(
  '/:propertyId/tenant',
  zValidator('json', tenantSchema),
  async (c) => {
    const actor = c.get('user')!
    const propertyId = c.req.param('propertyId')
    const input = c.req.valid('json')

    const tenancyId = await db.$transaction(async (tx) => {
      const tenancy = await tx.propertyTenancy.create({
        data: {
          propertyId,
          userId: input.userId,
          cycle: input.cycle,
          cyclePayment: input.cyclePayment,
          contractDate: new Date(input.contractDate),
          contractUrl: input.contractUrl ?? null,
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
          depositAmount: input.depositAmount ? input.depositAmount : null,
        },
      })

      if (input.leaseAgreementKey && input.leaseAgreementName) {
        await tx.attachment.create({
          data: {
            storageKey: input.leaseAgreementKey,
            mimeType: input.leaseAgreementMime ?? 'application/pdf',
            sizeBytes: BigInt(input.leaseAgreementSize ?? 0),
            name: input.leaseAgreementName,
            entityType: AttachmentEntityType.LEASE,
            entityId: tenancy.id,
            fieldName: 'leaseAgreement',
            uploadedBy: actor.id,
          },
        })
      }

      await tx.auditLog.create({
        data: {
          action: 'ASSIGN_TENANT',
          entity: 'PropertyTenancy',
          entityId: tenancy.id,
          actorId: actor.id,
          after: {
            propertyId,
            userId: input.userId,
            cycle: input.cycle,
          },
        },
      })

      return tenancy.id
    })

    return c.json({ ok: true, data: { tenancyId } })
  },
)

// ─── POST /payments — record a property installment payment ──────────────────
const paymentSchema = z.object({
  installmentId: z.string().min(1),
  ownershipId: z.string().min(1),
  amount: z.string().min(1),
  paidAt: z.string().min(1),
  proofUrl: z.string().optional(),
})

propertiesRoute.post('/payments', zValidator('json', paymentSchema), async (c) => {
  const input = c.req.valid('json')

  const created = await db.propertyPayment.create({
    data: {
      installmentId: input.installmentId,
      ownershipId: input.ownershipId,
      amount: input.amount,
      paidAt: new Date(input.paidAt),
      proofUrl: input.proofUrl ?? null,
    },
  })

  return c.json({ ok: true, data: { paymentId: created.id } })
})
