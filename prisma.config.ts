import { defineConfig } from 'prisma/config'
import { existsSync } from 'fs'

if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // CLI and migrations always use the direct connection (port 5432).
    // DATABASE_URL (pooler, port 6543) is only used at runtime via the
    // PrismaPg adapter in src/lib/prisma.ts.
    url: process.env.DIRECT_URL!,
  },
})
