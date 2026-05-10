import { createClerkClient, verifyToken } from '@clerk/backend'
import { env } from './env.js'

export const clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY })

export async function verifyClerkJwt(token: string) {
  // The newer @clerk/backend `verifyToken` no longer accepts `issuer`. Issuer
  // is enforced implicitly via `secretKey`; if you need to pin a specific
  // Clerk Frontend API origin, use `authorizedParties` instead.
  return verifyToken(token, {
    secretKey: env.CLERK_SECRET_KEY,
  })
}
