import { db } from '../db.js'

export interface AuditEntryInput {
  action: string
  entity: string
  entityId?: string
  actorId: string
  before?: unknown
  after?: unknown
}

export async function createAuditEntry(entry: AuditEntryInput) {
  return db.auditLog.create({
    data: {
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      actorId: entry.actorId,
      before: entry.before !== undefined ? (entry.before as object) : undefined,
      after: entry.after !== undefined ? (entry.after as object) : undefined,
    },
  })
}
