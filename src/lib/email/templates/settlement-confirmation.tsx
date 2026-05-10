import { Section, Text } from '@react-email/components'
import * as React from 'react'
import { render } from '@react-email/render'
import { EmailLayout, COLORS } from './_layout.js'

export interface SettlementConfirmationData {
  recipientName: string
  amountKcrd: string
  status: 'approved' | 'settled' | 'declined'
  declineReason?: string
  settlementId: string
  historyUrl: string
}

function SettlementConfirmationEmail({
  recipientName,
  amountKcrd,
  status,
  declineReason,
  settlementId,
  historyUrl,
}: SettlementConfirmationData) {
  const isApproved = status === 'approved'
  const isSettled = status === 'settled'
  const isDeclined = status === 'declined'

  const headline = isDeclined
    ? 'Settlement request declined.'
    : isSettled
    ? 'Settlement processed.'
    : 'Settlement request approved.'

  const statusColor = isDeclined ? COLORS.danger : COLORS.success
  const statusLabel = isDeclined ? 'Declined' : isSettled ? 'Processed' : 'Approved'

  return (
    <EmailLayout preview={`Settlement update — ${amountKcrd} KCRD`}>
      <Text style={{ fontSize: 20, fontWeight: 600, color: COLORS.green900, fontFamily: 'Cambria, Georgia, serif', margin: '0 0 8px' }}>
        {headline}
      </Text>
      <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 24px' }}>
        Hello {recipientName}, here is an update on your settlement request.
      </Text>

      <Section style={{ backgroundColor: COLORS.stone100, borderRadius: 8, padding: '16px 20px', marginBottom: 24 }}>
        <Text style={{ fontSize: 12, color: COLORS.stone500, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>Amount</Text>
        <Text style={{ fontSize: 20, fontWeight: 700, color: COLORS.stone900, fontFamily: 'monospace', margin: '0 0 12px' }}>{amountKcrd} KCRD</Text>
        <Text style={{ fontSize: 12, color: COLORS.stone500, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>Status</Text>
        <Text style={{ fontSize: 14, fontWeight: 600, color: statusColor, margin: '0 0 12px' }}>{statusLabel}</Text>
        <Text style={{ fontSize: 12, color: COLORS.stone500, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>Reference</Text>
        <Text style={{ fontSize: 12, color: COLORS.stone700, fontFamily: 'monospace', margin: 0 }}>{settlementId}</Text>
      </Section>

      {isDeclined && declineReason ? (
        <Section style={{ backgroundColor: '#FDF2F2', borderRadius: 8, padding: '16px 20px', marginBottom: 24, border: `1px solid #F5CECE` }}>
          <Text style={{ fontSize: 13, color: COLORS.danger, margin: 0, lineHeight: 1.6 }}>
            <strong>Reason:</strong> {declineReason}
          </Text>
        </Section>
      ) : null}

      {isApproved ? (
        <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 24px' }}>
          Your request has been approved and will be processed by our treasury team shortly.
        </Text>
      ) : null}

      {isSettled ? (
        <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 24px' }}>
          Your funds have been released. View proof of payment in your settlement history.
        </Text>
      ) : null}

      <Text style={{ fontSize: 14, color: COLORS.stone700, margin: 0 }}>
        <a href={historyUrl} style={{ color: COLORS.green700 }}>View your settlement history →</a>
      </Text>
    </EmailLayout>
  )
}

export async function renderSettlementConfirmation(data: SettlementConfirmationData): Promise<string> {
  return render(<SettlementConfirmationEmail {...data} />)
}
