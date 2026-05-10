// Phase 1 stub — server-action wrappers from the Next.js website do not
// translate directly to Hono. The shape is preserved here so that ported
// lib/* code typechecks. In Phase 3 the actual route handlers will be
// rewritten as Hono routes, with role gating done by middleware
// (`requireRole`) and Zod validation done by `@hono/zod-validator`.
import type { Role } from '@prisma/client'
import type { AuthUser } from './auth.js'

export type { AuthUser }

type WithAdminOpts = {
  roles?: Role[]
  scope?: string
}

type ActionFn<TArgs extends unknown[], TReturn> = (
  user: AuthUser,
  ...args: TArgs
) => Promise<TReturn>

export function withAdminAction<TArgs extends unknown[], TReturn>(
  fn: ActionFn<TArgs, TReturn>,
  _opts?: WithAdminOpts,
): (...args: TArgs) => Promise<TReturn> {
  return async (..._args: TArgs) => {
    void fn
    throw new Error(
      '[backend/lib/action.ts] withAdminAction is a Phase 1 stub. ' +
        'Wire this function as a Hono route in Phase 3.',
    )
  }
}

export function withResidentAction<TArgs extends unknown[], TReturn>(
  fn: ActionFn<TArgs, TReturn>,
  _opts?: WithAdminOpts,
): (...args: TArgs) => Promise<TReturn> {
  return async (..._args: TArgs) => {
    void fn
    throw new Error(
      '[backend/lib/action.ts] withResidentAction is a Phase 1 stub. ' +
        'Wire this function as a Hono route in Phase 3.',
    )
  }
}
