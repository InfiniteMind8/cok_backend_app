// Backend-flavored MFA helpers. The Next.js website calls `redirect()` to
// punt staff users to /account/mfa-enroll; on the backend we surface the
// requirement as a boolean / throwable instead and let the frontend route
// the response code to the enrolment page.
import type { Role } from '@prisma/client'
import { clerkClient } from '../clerk.js'

export const STAFF_ROLES: Role[] = ['MASTER_ADMIN', 'ADMIN']

export function isStaffRole(role: Role): boolean {
  return STAFF_ROLES.includes(role)
}

export class MfaEnrolmentRequiredError extends Error {
  constructor() {
    super('MFA enrolment is required for staff roles.')
    this.name = 'MfaEnrolmentRequiredError'
  }
}

export async function isMfaEnrolled(clerkUserId: string): Promise<boolean> {
  const clerkUser = await clerkClient.users.getUser(clerkUserId)
  return Boolean(clerkUser.twoFactorEnabled)
}

export async function assertMfaEnrolled(user: {
  clerkId: string | null
  role: Role
}): Promise<void> {
  if (!isStaffRole(user.role)) return
  if (!user.clerkId) throw new MfaEnrolmentRequiredError()
  const enrolled = await isMfaEnrolled(user.clerkId)
  if (!enrolled) throw new MfaEnrolmentRequiredError()
}
