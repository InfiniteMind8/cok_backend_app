import { Hono } from 'hono'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { ApiError } from '../../lib/api-error.js'
import { createAuditEntry } from '../../lib/audit/index.js'
import { runAndSaveReconciliation } from '../../lib/ledger/reconciliation-report.js'

export const reconciliationRoute = new Hono<AppEnv>()

// ─── GET /reports — paginated reconciliation report list ─────────────────────
reconciliationRoute.get('/reports', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1)
  const pageSize = 20
  const skip = (page - 1) * pageSize
  const from = c.req.query('from')
  const to = c.req.query('to')

  const where = {
    ...(from || to
      ? {
          runAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  }

  const [reports, total] = await Promise.all([
    db.reconciliationReport.findMany({
      where,
      orderBy: { runAt: 'desc' },
      skip,
      take: pageSize,
      include: { acknowledgedBy: { select: { fullName: true } } },
    }),
    db.reconciliationReport.count({ where }),
  ])

  return c.json({
    ok: true,
    data: {
      reports: reports.map((r) => ({
        id: r.id,
        runAt: r.runAt.toISOString(),
        status: r.status,
        details: r.details,
        acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
        acknowledgedBy: r.acknowledgedBy
          ? { fullName: r.acknowledgedBy.fullName }
          : null,
      })),
      total,
      page,
      pageSize,
    },
  })
})

// ─── GET /reports/:reportId — single report detail ───────────────────────────
reconciliationRoute.get('/reports/:reportId', async (c) => {
  const reportId = c.req.param('reportId')
  const report = await db.reconciliationReport.findUnique({
    where: { id: reportId },
    include: { acknowledgedBy: { select: { fullName: true, email: true } } },
  })
  if (!report) throw ApiError.notFound('Report not found')

  return c.json({
    ok: true,
    data: {
      id: report.id,
      runAt: report.runAt.toISOString(),
      status: report.status,
      details: report.details,
      acknowledgedAt: report.acknowledgedAt ? report.acknowledgedAt.toISOString() : null,
      acknowledgedBy: report.acknowledgedBy,
    },
  })
})

// ─── POST /run-now — run a reconciliation report on demand ───────────────────
// Mirrors the cron route at /cron/reconciliation but runs in-band as an admin
// action. Returns the new report's id and headline status.
reconciliationRoute.post('/run-now', async (c) => {
  const admin = c.get('user')!

  const report = await runAndSaveReconciliation()

  await createAuditEntry({
    action: 'reconciliation.run_now',
    entity: 'ReconciliationReport',
    entityId: report.id,
    actorId: admin.id,
    after: { status: report.status, discrepancy: report.details.discrepancy },
  })

  return c.json({
    ok: true,
    data: {
      reportId: report.id,
      status: report.status,
      discrepancy: report.details.discrepancy,
    },
  })
})

// ─── POST /:reportId/acknowledge ─────────────────────────────────────────────
// Acknowledge a MISMATCH alert. Idempotency: refuses if already acknowledged.
reconciliationRoute.post('/:reportId/acknowledge', async (c) => {
  const admin = c.get('user')!
  const reportId = c.req.param('reportId')

  const report = await db.reconciliationReport.findUnique({ where: { id: reportId } })
  if (!report) throw ApiError.notFound('Report not found')
  if (report.acknowledgedAt) throw ApiError.conflict('Already acknowledged')

  const acknowledgedAt = new Date()

  await db.reconciliationReport.update({
    where: { id: reportId },
    data: { acknowledgedById: admin.id, acknowledgedAt },
  })

  await createAuditEntry({
    action: 'reconciliation.acknowledged',
    entity: 'ReconciliationReport',
    entityId: reportId,
    actorId: admin.id,
    before: { acknowledgedAt: null },
    after: {
      acknowledgedAt: acknowledgedAt.toISOString(),
      acknowledgedById: admin.id,
    },
  })

  return c.json({ ok: true, data: { reportId, acknowledgedAt: acknowledgedAt.toISOString() } })
})
