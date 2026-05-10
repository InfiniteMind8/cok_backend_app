import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { env } from '../env.js'

export interface PutResult {
  storage_key: string
  size: number
  sha256: string
}

export interface HeadResult {
  size: number
  mime: string
}

export interface StorageDriver {
  put(key: string, body: Buffer, mime: string): Promise<PutResult>
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>
  delete(key: string): Promise<void>
  head(key: string): Promise<HeadResult>
}

function sha256hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function mimeFromKey(key: string): string {
  const ext = path.extname(key).toLowerCase()
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
  }
  return map[ext] ?? 'application/octet-stream'
}

// Local Driver — on-disk layout: storage/{key}
// File format: [12-byte IV][16-byte GCM auth tag][ciphertext]
const IV_SIZE = 12
const AUTH_TAG_SIZE = 16
const HEADER_SIZE = IV_SIZE + AUTH_TAG_SIZE

export class LocalStorageDriver implements StorageDriver {
  private readonly root: string
  private readonly keyBuf: Buffer
  private readonly baseUrl: string

  constructor(encryptionKey: string, storageRoot?: string, baseUrl?: string) {
    if (!encryptionKey || encryptionKey.length !== 64) {
      throw new Error(
        'STORAGE_ENCRYPTION_KEY must be 64 hex characters (32 bytes). ' +
          'Generate with: openssl rand -hex 32',
      )
    }
    this.keyBuf = Buffer.from(encryptionKey, 'hex')
    this.root = storageRoot ?? path.join(process.cwd(), 'storage')
    this.baseUrl = baseUrl ?? ''
  }

  async put(key: string, body: Buffer, _mime: string): Promise<PutResult> {
    const iv = crypto.randomBytes(IV_SIZE)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.keyBuf, iv)
    const ciphertext = Buffer.concat([cipher.update(body), cipher.final()])
    const authTag = cipher.getAuthTag()

    const fileData = Buffer.concat([iv, authTag, ciphertext])
    const filePath = path.join(this.root, key)
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    await fs.promises.writeFile(filePath, fileData)

    return {
      storage_key: key,
      size: body.length,
      sha256: sha256hex(body),
    }
  }

  async getSignedUrl(key: string, ttlSeconds: number): Promise<string> {
    const exp = Date.now() + ttlSeconds * 1000
    const payload = JSON.stringify({ key, exp })
    const payloadB64 = Buffer.from(payload).toString('base64url')
    const sig = crypto.createHmac('sha256', this.keyBuf).update(payloadB64).digest('base64url')
    const token = `${payloadB64}.${sig}`
    return `${this.baseUrl}/api/attachments/serve?token=${encodeURIComponent(token)}`
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.root, key)
    await fs.promises.unlink(filePath)
  }

  async head(key: string): Promise<HeadResult> {
    const filePath = path.join(this.root, key)
    const stat = await fs.promises.stat(filePath)
    const plaintextSize = stat.size - HEADER_SIZE
    return {
      size: Math.max(0, plaintextSize),
      mime: mimeFromKey(key),
    }
  }

  async decrypt(key: string): Promise<{ data: Buffer; mime: string }> {
    const filePath = path.join(this.root, key)
    const fileData = await fs.promises.readFile(filePath)
    const iv = fileData.subarray(0, IV_SIZE)
    const authTag = fileData.subarray(IV_SIZE, HEADER_SIZE)
    const ciphertext = fileData.subarray(HEADER_SIZE)

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.keyBuf, iv)
    decipher.setAuthTag(authTag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return { data: plaintext, mime: mimeFromKey(key) }
  }

  verifyToken(token: string): { key: string; exp: number } | null {
    const parts = token.split('.')
    if (parts.length !== 2) return null
    const [payloadB64, sig] = parts
    if (!payloadB64 || !sig) return null
    const expectedSig = crypto
      .createHmac('sha256', this.keyBuf)
      .update(payloadB64)
      .digest('base64url')
    const sigBuf = Buffer.from(sig, 'base64url')
    const expectedBuf = Buffer.from(expectedSig, 'base64url')
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf))
      return null
    try {
      return JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
        key: string
        exp: number
      }
    } catch {
      return null
    }
  }
}

export interface S3DriverConfig {
  bucket: string
  region: string
  endpoint: string
  accessKey: string
  secretKey: string
}

export class S3StorageDriver implements StorageDriver {
  private readonly config: S3DriverConfig

  constructor(config: S3DriverConfig) {
    this.config = config
  }

  private async getClient() {
    const { S3Client } = await import('@aws-sdk/client-s3')
    return new S3Client({
      region: this.config.region,
      endpoint: this.config.endpoint || undefined,
      credentials: {
        accessKeyId: this.config.accessKey,
        secretAccessKey: this.config.secretKey,
      },
      forcePathStyle: !!this.config.endpoint,
    })
  }

  async put(key: string, body: Buffer, mime: string): Promise<PutResult> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.getClient()
    await client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: mime,
        ServerSideEncryption: 'AES256',
      }),
    )
    return {
      storage_key: key,
      size: body.length,
      sha256: sha256hex(body),
    }
  }

  async getSignedUrl(key: string, ttlSeconds: number): Promise<string> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
    const client = await this.getClient()
    const ttl = Math.min(ttlSeconds, 300)
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      { expiresIn: ttl },
    )
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.getClient()
    await client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }))
  }

  async head(key: string): Promise<HeadResult> {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.getClient()
    const res = await client.send(
      new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
    )
    return {
      size: res.ContentLength ?? 0,
      mime: res.ContentType ?? 'application/octet-stream',
    }
  }
}

let _storage: StorageDriver | null = null

export function getStorage(): StorageDriver {
  if (_storage) return _storage

  if (env.STORAGE_DRIVER === 's3') {
    const bucket = env.STORAGE_S3_BUCKET
    const region = env.STORAGE_S3_REGION
    const accessKey = env.STORAGE_S3_ACCESS_KEY_ID
    const secretKey = env.STORAGE_S3_SECRET_ACCESS_KEY
    if (!bucket || !region || !accessKey || !secretKey) {
      throw new Error(
        'STORAGE_DRIVER=s3 requires STORAGE_S3_BUCKET, STORAGE_S3_REGION, ' +
          'STORAGE_S3_ACCESS_KEY_ID, and STORAGE_S3_SECRET_ACCESS_KEY',
      )
    }
    _storage = new S3StorageDriver({
      bucket,
      region,
      endpoint: env.STORAGE_S3_ENDPOINT ?? '',
      accessKey,
      secretKey,
    })
    return _storage
  }

  _storage = new LocalStorageDriver(env.STORAGE_ENCRYPTION_KEY ?? '')
  return _storage
}

// Allow resetting singleton in tests
export function _resetStorageForTest(): void {
  _storage = null
}
