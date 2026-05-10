import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { AppEnv } from '../../server.js'
import { db } from '../../lib/db.js'
import { ApiError } from '../../lib/api-error.js'
import type { FeeScheduleRules } from '../../lib/ledger/types.js'

export const settingsRoute = new Hono<AppEnv>()

// ─── Apply a fee schedule ────────────────────────────────────────────────────
const feeRuleSchema = z.object({
  totalPct: z.number().min(0).max(100),
  communityFundPct: z.number().min(0).max(100),
  operationsFundPct: z.number().min(0).max(100),
  developerSharePct: z.number().min(0).max(100),
})

const applyFeeScheduleSchema = z.object({
  rules: z.record(z.string(), feeRuleSchema),
  effectiveFrom: z.coerce.date(),
})

settingsRoute.post(
  '/fee-schedule',
  zValidator('json', applyFeeScheduleSchema),
  async (c) => {
    const user = c.get('user')!
    const { rules, effectiveFrom } = c.req.valid('json')

    if (effectiveFrom.getTime() < Date.now() - 60_000) {
      throw ApiError.validation('Effective date cannot be in the past.')
    }

    // Each rule must have its parts sum to its totalPct (within rounding).
    for (const [type, rule] of Object.entries(rules)) {
      const parts = rule.communityFundPct + rule.operationsFundPct + rule.developerSharePct
      if (Math.abs(parts - rule.totalPct) > 0.01) {
        throw ApiError.validation(
          `Rule ${type}: communityFundPct + operationsFundPct + developerSharePct must equal totalPct.`,
        )
      }
    }

    const newRules = rules as FeeScheduleRules

    const scheduleId = await db.$transaction(async (tx) => {
      const active = await tx.feeSchedule.findFirst({
        where: { effectiveTo: null },
        orderBy: { effectiveAt: 'desc' },
      })

      const oldRules: FeeScheduleRules = (active?.rules ?? {}) as FeeScheduleRules

      if (active) {
        await tx.feeSchedule.update({
          where: { id: active.id },
          data: { effectiveTo: new Date() },
        })
      }

      const newSchedule = await tx.feeSchedule.create({
        data: {
          effectiveAt: effectiveFrom,
          effectiveTo: null,
          rules: newRules as object,
          createdBy: user.id,
        },
      })

      // Diff old vs new rules → one FEE_RULE_CHANGED audit row per changed key.
      const allKeys = Array.from(
        new Set([...Object.keys(oldRules), ...Object.keys(newRules)]),
      )
      const changedEntries = allKeys
        .filter((key) => {
          const oldEntry = oldRules[key as keyof FeeScheduleRules]
          const newEntry = newRules[key as keyof FeeScheduleRules]
          return JSON.stringify(oldEntry) !== JSON.stringify(newEntry)
        })
        .map((key) => ({
          action: 'FEE_RULE_CHANGED',
          entity: 'FeeSchedule',
          entityId: newSchedule.id,
          actorId: user.id,
          before: (oldRules[key as keyof FeeScheduleRules] as object) ?? Prisma.JsonNull,
          after: (newRules[key as keyof FeeScheduleRules] as object) ?? Prisma.JsonNull,
        }))

      if (changedEntries.length > 0) {
        await tx.auditLog.createMany({ data: changedEntries })
      }

      await tx.auditLog.create({
        data: {
          action: 'FEE_SCHEDULE_APPLIED',
          entity: 'FeeSchedule',
          entityId: newSchedule.id,
          actorId: user.id,
          after: newRules as object,
        },
      })

      return newSchedule.id
    })

    return c.json({ ok: true, data: { scheduleId } })
  },
)

// ─── GET /fee-schedule/history — last 20 schedules with admin name ───────────
settingsRoute.get('/fee-schedule/history', async (c) => {
  const schedules = await db.feeSchedule.findMany({
    orderBy: { effectiveAt: 'desc' },
    take: 20,
  })

  const actorIds = [...new Set(schedules.map((s) => s.createdBy))]
  const users = await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, fullName: true },
  })
  const nameMap = new Map(users.map((u) => [u.id, u.fullName]))

  const rows = schedules.map((s) => ({
    id: s.id,
    effectiveAt: s.effectiveAt,
    effectiveTo: s.effectiveTo,
    rules: s.rules as FeeScheduleRules,
    createdBy: nameMap.get(s.createdBy) ?? s.createdBy,
    createdAt: s.createdAt,
    isActive: s.effectiveTo === null,
  }))

  return c.json({ ok: true, data: rows })
})

// Local Prisma import only used for JsonNull in audit entries above.
import { Prisma } from '@prisma/client'
