import { cors } from 'hono/cors'
import { env } from '../lib/env.js'

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return null
    return env.CORS_ORIGINS.includes(origin) ? origin : null
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposeHeaders: ['X-Request-Id', 'Retry-After'],
  credentials: true,
  maxAge: 600,
})
