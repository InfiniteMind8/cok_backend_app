import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { env } from './env.js'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

function createClient(): PrismaClient {
  // Use an explicit Pool so we control max connections.
  // pgbouncer=true in DATABASE_URL disables prepared statements (required for
  // Supabase transaction-mode pooling). The pool's own max is kept small
  // because pgbouncer manages the actual DB connections on the other side.
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 5,
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const prisma = globalThis.__prisma ?? createClient()

if (env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma
}
