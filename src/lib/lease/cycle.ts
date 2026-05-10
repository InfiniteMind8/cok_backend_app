import {
  addDays,
  addMonths,
  addYears,
  differenceInDays,
  isBefore,
  isAfter,
} from 'date-fns'
import type { CycleUnit, LeaseStatus } from '@prisma/client'

export function addOneCycle(date: Date, unit: CycleUnit): Date {
  switch (unit) {
    case 'DAILY':
      return addDays(date, 1)
    case 'WEEKLY':
      return addDays(date, 7)
    case 'MONTHLY':
      return addMonths(date, 1)
    case 'ANNUAL':
      return addYears(date, 1)
  }
}

export function computeNextPaymentDue(startDate: Date, unit: CycleUnit, today: Date): Date {
  let due = new Date(startDate)
  // Advance until the due date is strictly after today
  while (!isAfter(due, today)) {
    due = addOneCycle(due, unit)
  }
  return due
}

export function computeLeaseStatus(endDate: Date | null, today: Date): LeaseStatus {
  if (!endDate) return 'ACTIVE'
  const daysRemaining = differenceInDays(endDate, today)
  // daysRemaining <= 0 means endDate is today or in the past → EXPIRED
  if (daysRemaining <= 0) return 'EXPIRED'
  if (daysRemaining <= 14) return 'ENDING_SOON'
  return 'ACTIVE'
}

export function isLeaseExpired(endDate: Date | null, today: Date): boolean {
  if (!endDate) return false
  return isBefore(endDate, today)
}
