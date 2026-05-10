// Phase 1 stub — backend authentication is handled by Hono middleware
// (`requireAuth` in src/middleware/auth.ts) which sets `c.var.user`. The
// Next.js `getCurrentUser()` helper does not exist on this side; copied
// lib/* code that imported `@/lib/auth` should be re-wired to read user
// from Hono context in Phase 3 when routes are built.
import type { Role } from '@prisma/client'

export type AuthUser = {
  id: string
  email: string
  fullName: string
  role: Role
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  throw new Error(
    '[backend/lib/auth.ts] getCurrentUser() is not implemented on the backend. ' +
      'Use Hono context (c.var.user) instead, set by the requireAuth middleware.',
  )
}
