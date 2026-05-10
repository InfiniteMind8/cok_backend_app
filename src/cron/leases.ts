import type { LeaseStatus } from '@prisma/client'
import { db } from '../lib/db.js'
import { env } from '../lib/env.js'
import { computeNextPaymentDue, computeLeaseStatus } from '../lib/lease/cycle.js'

export interface LeaseCronResult {
  ok: true
  processed: number
  updated: number
  endingSoonEmailed: number
}

// Daily lease maintenance — advance nextPaymentDue cycles, recompute lease
// statuses (ACTIVE → ENDING_SOON → EXPIRED), and email residents whose lease
// just transitioned into ENDING_SOON.
export async function runLeasesCron(): Promise<LeaseCronResult> {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const tenancies = await db.propertyTenancy.findMany({
    where: { leaseStatus: { in: ['ACTIVE', 'ENDING_SOON'] } },
    include: {
      user: { select: { id: true, email: true, fullName: true } },
      property: { select: { code: true } },
    },
  })

  let updated = 0
  let endingSoonEmailed = 0

  for (const tenancy of tenancies) {
    const prevStatus = tenancy.leaseStatus as LeaseStatus

    let newNextPaymentDue = tenancy.nextPaymentDue
    if (tenancy.startDate) {
      const currentDue = tenancy.nextPaymentDue ?? tenancy.startDate
      if (currentDue <= today) {
        newNextPaymentDue = computeNextPaymentDue(currentDue, tenancy.cycleUnit, today)
      }
    }

    const newStatus = computeLeaseStatus(tenancy.endDate, today)

    const changed =
      newStatus !== prevStatus ||
      (newNextPaymentDue && tenancy.nextPaymentDue?.getTime() !== newNextPaymentDue.getTime())

    if (!changed) continue

    await db.propertyTenancy.update({
      where: { id: tenancy.id },
      data: {
        leaseStatus: newStatus,
        ...(newNextPaymentDue ? { nextPaymentDue: newNextPaymentDue } : {}),
      },
    })

    updated++

    if (prevStatus === 'ACTIVE' && newStatus === 'ENDING_SOON') {
      const endDateFormatted = tenancy.endDate
        ? tenancy.endDate.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
        : 'soon'

      // Dynamic import keeps cold-start cheap when no transitions occur.
      const { sendEmail } = await import('../lib/email/service.js')
      await sendEmail({
        template: 'lease-ending-soon',
        to: tenancy.user.email,
        subject: `Your lease for ${tenancy.property.code} is ending soon`,
        data: {
          residentName: tenancy.user.fullName,
          propertyCode: tenancy.property.code,
          endDate: endDateFormatted,
          daysUntilEnd: 14,
          propertyUrl: `${env.APP_URL}/property`,
        },
        idempotencyKey: `cron-ending-soon:${tenancy.id}:${today.toISOString().slice(0, 10)}`,
      }).catch(() => {})

      endingSoonEmailed++
    }
  }

  return {
    ok: true,
    processed: tenancies.length,
    updated,
    endingSoonEmailed,
  }
}
