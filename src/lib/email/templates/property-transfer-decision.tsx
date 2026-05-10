import { Section, Text } from '@react-email/components'
import * as React from 'react'
import { render } from '@react-email/render'
import { EmailLayout, COLORS } from './_layout.js'

export interface PropertyTransferDecisionData {
  recipientName: string
  propertyCode: string
  propertyAddress?: string
  decision: 'approved' | 'declined'
  declineReason?: string
  requestId: string
  dashboardUrl: string
}

function PropertyTransferDecisionEmail({
  recipientName,
  propertyCode,
  propertyAddress,
  decision,
  declineReason,
  dashboardUrl,
}: PropertyTransferDecisionData) {
  const approved = decision === 'approved'

  return (
    <EmailLayout preview={`Property transfer ${approved ? 'approved' : 'declined'} — ${propertyCode}`}>
      <Text style={{ fontSize: 20, fontWeight: 600, color: COLORS.green900, fontFamily: 'Cambria, Georgia, serif', margin: '0 0 8px' }}>
        {approved ? 'Property transfer approved.' : 'Property transfer declined.'}
      </Text>
      <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 24px' }}>
        Hello {recipientName}, your property transfer request has been {decision}.
      </Text>

      <Section style={{ backgroundColor: COLORS.stone050, borderRadius: 8, padding: '16px 20px', marginBottom: 24, border: `1px solid ${COLORS.stone300}` }}>
        <Text style={{ fontSize: 12, color: COLORS.stone500, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>Property</Text>
        <Text style={{ fontSize: 16, fontWeight: 600, color: COLORS.stone900, fontFamily: 'monospace', margin: '0 0 4px' }}>{propertyCode}</Text>
        {propertyAddress ? (
          <Text style={{ fontSize: 13, color: COLORS.stone500, margin: 0 }}>{propertyAddress}</Text>
        ) : null}
      </Section>

      {!approved && declineReason ? (
        <Section style={{ backgroundColor: '#fff5f5', borderRadius: 8, padding: '16px 20px', marginBottom: 24, border: '1px solid #fed7d7' }}>
          <Text style={{ fontSize: 12, color: COLORS.stone500, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>Reason for decline</Text>
          <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: 0 }}>{declineReason}</Text>
        </Section>
      ) : null}

      {approved ? (
        <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 24px' }}>
          The ownership record has been updated. You can view the current status in your dashboard.
        </Text>
      ) : (
        <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 24px' }}>
          If you have questions about this decision, please contact your community administrator.
        </Text>
      )}

      <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 8px' }}>
        View your dashboard:{' '}
        <a href={dashboardUrl} style={{ color: COLORS.green700 }}>{dashboardUrl}</a>
      </Text>
    </EmailLayout>
  )
}

export async function renderPropertyTransferDecision(data: PropertyTransferDecisionData): Promise<string> {
  return render(<PropertyTransferDecisionEmail {...data} />)
}
