import path from 'node:path'
import { Hono } from 'hono'
import { createId } from '@paralleldrive/cuid2'
import type { AppEnv } from '../../server.js'
import { env } from '../../lib/env.js'
import { ApiError } from '../../lib/api-error.js'
import { LocalStorageDriver, getStorage } from '../../lib/storage/driver.js'
import { requireAuth } from '../../middleware/auth.js'

// MIME validation by magic bytes
const MAGIC: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'video/mp4', bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
]

function detectMime(buf: Buffer): string | null {
  for (const { mime, bytes, offset = 0 } of MAGIC) {
    if (bytes.every((b, i) => buf[offset + i] === b)) return mime
  }
  return null
}

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'video/quicktime',
])

const EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
}

const MAX_SIZE_BYTES = 64 * 1024 * 1024 // 64 MB hard cap

export const attachmentsRoute = new Hono<AppEnv>()

// GET /attachments/serve?token=...
// Public route — auth is the HMAC-signed token itself.
// Only used with STORAGE_DRIVER=local; S3 driver returns direct pre-signed URLs.
attachmentsRoute.get('/serve', async (c) => {
  const token = c.req.query('token')
  if (!token) throw ApiError.validation('Missing token')

  if (!env.STORAGE_ENCRYPTION_KEY) {
    throw new ApiError('INTERNAL_ERROR', 'Storage not configured')
  }

  const driver = new LocalStorageDriver(env.STORAGE_ENCRYPTION_KEY)
  const payload = driver.verifyToken(token)
  if (!payload) throw ApiError.unauthorized('Invalid token')

  if (Date.now() > payload.exp) {
    return c.json(
      { ok: false, error: { code: 'NOT_FOUND', message: 'Token expired' } },
      410,
    )
  }

  let decrypted: { data: Buffer; mime: string }
  try {
    decrypted = await driver.decrypt(payload.key)
  } catch {
    throw ApiError.notFound('File unavailable')
  }

  return new Response(new Uint8Array(decrypted.data), {
    status: 200,
    headers: {
      'Content-Type': decrypted.mime,
      'Content-Length': String(decrypted.data.length),
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline',
    },
  })
})

// POST /attachments/upload — authenticated; any role can upload (subject to
// downstream audit).
attachmentsRoute.post('/upload', requireAuth, async (c) => {
  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    throw ApiError.validation('Invalid multipart body')
  }

  const fileField = formData.get('file')
  if (!(fileField instanceof File)) {
    throw ApiError.validation('Missing file field')
  }

  const entityType = (formData.get('entityType') as string | null) ?? 'OTHER'
  const entityId = (formData.get('entityId') as string | null) ?? 'unknown'
  const fieldName = (formData.get('fieldName') as string | null) ?? 'attachment'
  const category = (formData.get('category') as string | null) ?? ''

  if (fileField.size > MAX_SIZE_BYTES) {
    throw ApiError.validation(
      `File exceeds maximum allowed size of ${MAX_SIZE_BYTES / (1024 * 1024)} MB`,
    )
  }

  const arrayBuf = await fileField.arrayBuffer()
  const buffer = Buffer.from(arrayBuf)

  const detectedMime = detectMime(buffer)
  const declaredMime = fileField.type || 'application/octet-stream'
  const mime = detectedMime ?? declaredMime

  if (!ALLOWED_MIME.has(mime)) {
    throw ApiError.validation(`File type not allowed: ${mime}`)
  }

  const fileId = createId()
  const origExt = path.extname(fileField.name).toLowerCase()
  const ext = origExt && EXTENSION_MAP[mime] ? origExt : (EXTENSION_MAP[mime] ?? origExt)
  const storageKey = `${entityType.toLowerCase()}/${entityId}/${fieldName}/${fileId}${ext}`

  const storage = getStorage()
  const { storage_key, size, sha256 } = await storage.put(storageKey, buffer, mime)

  return c.json({
    ok: true,
    data: {
      storageKey: storage_key,
      sha256,
      encrypted: env.STORAGE_DRIVER === 'local',
      name: fileField.name,
      size,
      type: mime,
      category,
    },
  })
})
