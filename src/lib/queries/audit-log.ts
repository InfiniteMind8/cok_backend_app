import { db } from '../db.js'

export interface AuditLogFilter {
  actorId?: string
  action?: string
  entity?: string
  entityId?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

export async function getAuditLogs(filters: AuditLogFilter = {}) {
  const { actorId, action, entity, entityId, dateFrom, dateTo, page = 1, pageSize = 50 } = filters
  const skip = (page - 1) * pageSize

  const where = buildWhere({ actorId, action, entity, entityId, dateFrom, dateTo })

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    db.auditLog.count({ where }),
  ])

  return { logs, total }
}

export async function getAuditLogsForExport(filters: Omit<AuditLogFilter, 'page' | 'pageSize'>) {
  const where = buildWhere(filters)

  const logs: Awaited<ReturnType<typeof db.auditLog.findMany>> = []
  let cursor: string | undefined

  // Cursor-paginate in batches of 1000, max 10k rows
  for (let i = 0; i < 10; i++) {
    const batch = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 1000,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    logs.push(...batch)
    if (batch.length < 1000) break
    const last = batch[batch.length - 1]
    if (!last) break
    cursor = last.id
  }

  return logs
}

export async function getEntityAuditLogs(entity: string, entityId: string, limit = 50) {
  return db.auditLog.findMany({
    where: { entity, entityId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

function buildWhere(filters: Omit<AuditLogFilter, 'page' | 'pageSize'>) {
  const { actorId, action, entity, entityId, dateFrom, dateTo } = filters

  return {
    ...(actorId ? { actorId } : {}),
    ...(action ? { action: { contains: action, mode: 'insensitive' as const } } : {}),
    ...(entity ? { entity } : {}),
    ...(entityId ? { entityId } : {}),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59.999Z') } : {}),
          },
        }
      : {}),
  }
}
