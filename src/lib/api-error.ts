/**
 * Standard error envelope for the API. Throw these from any handler / service
 * and the global errorMiddleware will format them as the right HTTP status +
 * { ok: false, error: { code, message, details? } } body.
 */

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
}

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly details?: unknown

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = STATUS_BY_CODE[code]
    this.details = details
  }

  static unauthorized(message = 'Authentication required', details?: unknown) {
    return new ApiError('UNAUTHORIZED', message, details)
  }
  static forbidden(message = 'Insufficient permissions', details?: unknown) {
    return new ApiError('FORBIDDEN', message, details)
  }
  static notFound(message = 'Resource not found', details?: unknown) {
    return new ApiError('NOT_FOUND', message, details)
  }
  static validation(message = 'Invalid request', details?: unknown) {
    return new ApiError('VALIDATION_ERROR', message, details)
  }
  static conflict(message = 'Conflict', details?: unknown) {
    return new ApiError('CONFLICT', message, details)
  }
  static rateLimited(message = 'Too many requests', details?: unknown) {
    return new ApiError('RATE_LIMITED', message, details)
  }
}
