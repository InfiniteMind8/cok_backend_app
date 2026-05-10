import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),

  // Database
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),

  // Clerk
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1).optional(),
  CLERK_JWT_ISSUER: z.string().url().optional(),

  // Email
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().default('City of Karis <noreply@cityofkaris.example>'),
  RESEND_FROM_NAME: z.string().default('City of Karis'),

  // File uploads (UploadThing — Phase 1+ legacy, optional during port)
  UPLOADTHING_TOKEN: z.string().optional(),

  // Public app URL (for email links etc.)
  APP_URL: z.string().url().default('http://localhost:3000'),

  // Storage
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_ENCRYPTION_KEY: z.string().optional(),
  STORAGE_S3_BUCKET: z.string().optional(),
  STORAGE_S3_REGION: z.string().optional(),
  STORAGE_S3_ENDPOINT: z.string().url().optional(),
  STORAGE_S3_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Observability
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENV: z.string().optional(),

  // Rate limit (Upstash optional in dev)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Cron
  CRON_SECRET: z.string().min(1).optional(),

  // App config
  IMPORT_MAX_ROWS: z.coerce.number().int().positive().default(1000),
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  // Print friendly error and exit. Rejecting at startup beats discovering a
  // missing key 30 minutes into a request.
  const formatted = parsed.error.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n')
  // eslint-disable-next-line no-console
  console.error(`\n❌ Invalid environment configuration:\n${formatted}\n`)
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
