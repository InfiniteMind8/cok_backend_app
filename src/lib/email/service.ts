import { Resend } from 'resend'
import { z } from 'zod'
import { db } from '../db.js'
import { env } from '../env.js'
import { renderWelcome, type WelcomeData } from './templates/welcome.js'
import { renderCredentials, type CredentialsData } from './templates/credentials.js'
import { renderPasswordReset, type PasswordResetData } from './templates/password-reset.js'
import { renderVoucherDelivery, type VoucherDeliveryData } from './templates/voucher-delivery.js'
import { renderSettlementConfirmation, type SettlementConfirmationData } from './templates/settlement-confirmation.js'
import { renderRentalExtensionDecision, type RentalExtensionDecisionData } from './templates/rental-extension-decision.js'
import { renderEmergencyBroadcast, type EmergencyBroadcastData } from './templates/emergency-broadcast.js'
import { renderPropertyTransferDecision, type PropertyTransferDecisionData } from './templates/property-transfer-decision.js'
import { renderMfaReset, type MfaResetData } from './templates/mfa-reset.js'
import { renderTreasuryAlert, type TreasuryAlertData } from './templates/treasury-alert.js'
import { renderLeaseEndingSoon, type LeaseEndingSoonData } from './templates/lease-ending-soon.js'

let _resend: Resend | undefined
function getResend(): Resend {
  if (!_resend) _resend = new Resend(env.RESEND_API_KEY)
  return _resend
}

// ─── Template registry ────────────────────────────────────────────────────────

export type TemplateMap = {
  welcome: WelcomeData
  credentials: CredentialsData
  'password-reset': PasswordResetData
  'voucher-delivery': VoucherDeliveryData
  'settlement-confirmation': SettlementConfirmationData
  'rental-extension-decision': RentalExtensionDecisionData
  'emergency-broadcast': EmergencyBroadcastData
  'property-transfer-decision': PropertyTransferDecisionData
  'mfa-reset': MfaResetData
  'treasury-alert': TreasuryAlertData
  'lease-ending-soon': LeaseEndingSoonData
}

export type TemplateName = keyof TemplateMap

async function renderTemplate<T extends TemplateName>(
  template: T,
  data: TemplateMap[T],
): Promise<string> {
  switch (template) {
    case 'welcome':
      return renderWelcome(data as WelcomeData)
    case 'credentials':
      return renderCredentials(data as CredentialsData)
    case 'password-reset':
      return renderPasswordReset(data as PasswordResetData)
    case 'voucher-delivery':
      return renderVoucherDelivery(data as VoucherDeliveryData)
    case 'settlement-confirmation':
      return renderSettlementConfirmation(data as SettlementConfirmationData)
    case 'rental-extension-decision':
      return renderRentalExtensionDecision(data as RentalExtensionDecisionData)
    case 'emergency-broadcast':
      return renderEmergencyBroadcast(data as EmergencyBroadcastData)
    case 'property-transfer-decision':
      return renderPropertyTransferDecision(data as PropertyTransferDecisionData)
    case 'mfa-reset':
      return renderMfaReset(data as MfaResetData)
    case 'treasury-alert':
      return renderTreasuryAlert(data as TreasuryAlertData)
    case 'lease-ending-soon':
      return renderLeaseEndingSoon(data as LeaseEndingSoonData)
    default:
      throw new Error(`Unknown email template: ${String(template)}`)
  }
}

// ─── Input schema ─────────────────────────────────────────────────────────────

const sendEmailInputSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  idempotencyKey: z.string().min(1),
})

// ─── Result type ──────────────────────────────────────────────────────────────

export type EmailResult =
  | { ok: true; messageId: string; skipped?: boolean }
  | { ok: false; error: string }

// ─── Core sendEmail function ──────────────────────────────────────────────────

export async function sendEmail<T extends TemplateName>(opts: {
  to: string
  subject: string
  template: T
  data: TemplateMap[T]
  idempotencyKey: string
}): Promise<EmailResult> {
  const parsed = sendEmailInputSchema.safeParse(opts)
  if (!parsed.success) {
    return { ok: false, error: `Invalid input: ${parsed.error.message}` }
  }

  const { to, subject, idempotencyKey } = parsed.data

  // Idempotency guard: skip if already successfully sent with this key
  const existing = await db.emailLog.findUnique({ where: { idempotencyKey } })
  if (existing?.status === 'SENT') {
    return { ok: true, messageId: existing.providerMessageId ?? '', skipped: true }
  }

  // Render template first so we can store HTML for future resend-on-failure
  let html: string
  try {
    html = await renderTemplate(opts.template, opts.data)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    // Log the render failure without an html value — store empty string as sentinel
    if (existing) {
      await db.emailLog.update({
        where: { idempotencyKey },
        data: { status: 'FAILED', providerError: `Template render error: ${error}` },
      })
    } else {
      await db.emailLog.create({
        data: {
          recipient: to,
          subject,
          template: opts.template,
          html: '',
          idempotencyKey,
          status: 'FAILED',
          providerError: `Template render error: ${error}`,
        },
      })
    }
    return { ok: false, error }
  }

  // Upsert the log row to QUEUED with rendered HTML
  const logRow = existing
    ? await db.emailLog.update({
        where: { idempotencyKey },
        data: { status: 'QUEUED', html, providerError: null },
      })
    : await db.emailLog.create({
        data: {
          recipient: to,
          subject,
          template: opts.template,
          html,
          idempotencyKey,
          status: 'QUEUED',
        },
      })

  return dispatchEmail({ logId: logRow.id, to, subject, html })
}

// ─── Internal dispatch (shared by sendEmail and resendEmailById) ──────────────

async function dispatchEmail(opts: {
  logId: string
  to: string
  subject: string
  html: string
}): Promise<EmailResult> {
  const { logId, to, subject, html } = opts

  try {
    const result = await getResend().emails.send({
      from: `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`,
      to,
      subject,
      html,
    })

    if (result.error) {
      const errMsg = result.error.message ?? JSON.stringify(result.error)
      await db.emailLog.update({
        where: { id: logId },
        data: { status: 'FAILED', providerError: errMsg },
      })
      return { ok: false, error: errMsg }
    }

    await db.emailLog.update({
      where: { id: logId },
      data: {
        status: 'SENT',
        providerMessageId: result.data?.id ?? null,
        sentAt: new Date(),
        providerError: null,
      },
    })

    return { ok: true, messageId: result.data?.id ?? '' }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await db.emailLog.update({
      where: { id: logId },
      data: { status: 'FAILED', providerError: error },
    })
    return { ok: false, error }
  }
}

// ─── Resend a failed email by log ID ─────────────────────────────────────────

export async function resendEmailById(logId: string): Promise<EmailResult> {
  const log = await db.emailLog.findUniqueOrThrow({ where: { id: logId } })

  if (log.status === 'SENT') {
    return { ok: true, messageId: log.providerMessageId ?? '', skipped: true }
  }

  if (!log.html) {
    return { ok: false, error: 'Rendered HTML not available; cannot resend this message.' }
  }

  await db.emailLog.update({ where: { id: logId }, data: { status: 'QUEUED', providerError: null } })

  return dispatchEmail({ logId, to: log.recipient, subject: log.subject, html: log.html })
}
