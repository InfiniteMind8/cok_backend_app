import { createClerkClient, verifyToken } from '@clerk/backend'
import { env } from './env.js'

export const clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY })

export async function verifyClerkJwt(token: string) {
  return verifyToken(token, {
    secretKey: env.CLERK_SECRET_KEY,
    issuer: env.CLERK_JWT_ISSUER,
  })
}
