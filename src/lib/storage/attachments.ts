import type { AttachmentEntityType } from '@prisma/client'
import { db } from '../db.js'
import { getStorage } from './driver.js'

export type { AttachmentEntityType }

// Returns a short-lived signed URL (5 min TTL) for the given attachment.
// No authorization check — callers are responsible for auth before calling.
export async function getAttachmentUrl(attachmentId: string): Promise<string> {
  const attachment = await db.attachment.findUniqueOrThrow({
    where: { id: attachmentId },
    select: { storageKey: true },
  })
  return getStorage().getSignedUrl(attachment.storageKey, 300)
}

export interface CreateAttachmentInput {
  storageKey: string
  mimeType: string
  sizeBytes: number
  name: string
  entityType: AttachmentEntityType
  entityId: string
  fieldName: string
  uploadedBy: string
}

export async function createAttachment(input: CreateAttachmentInput) {
  return db.attachment.create({
    data: {
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      sizeBytes: BigInt(input.sizeBytes),
      name: input.name,
      entityType: input.entityType,
      entityId: input.entityId,
      fieldName: input.fieldName,
      uploadedBy: input.uploadedBy,
    },
  })
}

export async function getAttachmentsByEntity(
  entityType: AttachmentEntityType,
  entityId: string,
) {
  return db.attachment.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'asc' },
  })
}

export async function getAttachmentsByEntityAndField(
  entityType: AttachmentEntityType,
  entityId: string,
  fieldName: string,
) {
  return db.attachment.findMany({
    where: { entityType, entityId, fieldName },
    orderBy: { createdAt: 'asc' },
  })
}
