import { Hono } from 'hono'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { getAuditLogsForExport } from '../../lib/queries/audit-log.js'

export const auditLogRoute = new Hono<AppEnv>()

// Inherits MASTER_ADMIN gate from the parent admin router.
// (Audit log export is also acceptable for ADMIN per Phase 1+ D-D4-01;
// admin router currently restricts to MASTER_ADMIN — relax in tandem.)
auditLogRoute.get('/export', async (c) => {
  const actor = c.get('user')!

  const filters = {
    actorId: c.req.query('actorId'),
    action: c.req.query('action'),
    entity: c.req.query('entity'),
    entityId: c.req.query('entityId'),
    dateFrom: c.req.query('dateFrom'),
    dateTo: c.req.query('dateTo'),
  }

  const logs = await getAuditLogsForExport(filters)

  await db.auditLog.create({
    data: {
      action: 'AUDIT_LOG_EXPORT',
      entity: 'AuditLog',
      actorId: actor.id,
      after: { filters, rowCount: logs.length },
    },
  })

  const header = ['id', 'createdAt', 'actorId', 'action', 'entity', 'entityId', 'before', 'after']
  const rows = logs.map((log) => [
    log.id,
    log.createdAt.toISOString(),
    log.actorId,
    log.action,
    log.entity,
    log.entityId ?? '',
    log.before !== null && log.before !== undefined ? JSON.stringify(log.before) : '',
    log.after !== null && log.after !== undefined ? JSON.stringify(log.after) : '',
  ])

  const csvLines = [header, ...rows].map((row) =>
    row
      .map((cell) => {
        const s = String(cell)
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`
        }
        return s
      })
      .join(','),
  )

  const csv = csvLines.join('\r\n')
  const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
})
