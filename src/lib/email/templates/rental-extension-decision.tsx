import { Section, Text } from '@react-email/components'
import * as React from 'react'
import { render } from '@react-email/render'
import { EmailLayout, COLORS } from './_layout.js'

export interface RentalExtensionDecisionData {
  residentName: string
  propertyCode: string
  decision: 'approved' | 'declined'
  newEndDate?: string
  decisionNote?: string
  leaseUrl: string
}

function RentalExtensionDecisionEmail({
  residentName,
  propertyCode,
  decision,
  newEndDate,
  decisionNote,
  leaseUrl,
}: RentalExtensionDecisionData) {
  const isApproved = decision === 'approved'

  return (
    <EmailLayout preview={`Rental extension ${isApproved ? 'approved' : 'declined'} — ${propertyCode}`}>
      <Text style={{ fontSize: 20, fontWeight: 600, color: COLORS.green900, fontFamily: 'Cambria, Georgia, serif', margin: '0 0 8px' }}>
        Rental extension {isApproved ? 'approved.' : 'declined.'}
      </Text>
      <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 24px' }}>
        Hello {residentName}, your rental extension request for property <strong>{propertyCode}</strong> has been reviewed.
      </Text>

      <Section style={{ backgroundColor: isApproved ? COLORS.green100 : '#FDF2F2', borderRadius: 8, padding: '16px 20px', marginBottom: 24, border: `1px solid ${isApproved ? COLORS.green500 : '#F5CECE'}` }}>
        <Text style={{ fontSize: 14, fontWeight: 600, color: isApproved ? COLORS.success : COLORS.danger, margin: '0 0 8px' }}>
          {isApproved ? 'Extension Approved' : 'Extension Declined'}
        </Text>
        {isApproved && newEndDate ? (
          <>
            <Text style={{ fontSize: 12, color: COLORS.stone500, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>New end date</Text>
            <Text style={{ fontSize: 16, fontWeight: 600, color: COLORS.stone900, margin: 0 }}>{newEndDate}</Text>
          </>
        ) : null}
        {decisionNote ? (
          <>
            <Text style={{ fontSize: 12, color: COLORS.stone500, margin: '12px 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>{isApproved ? 'Note' : 'Reason'}</Text>
            <Text style={{ fontSize: 14, color: COLORS.stone700, margin: 0, lineHeight: 1.6 }}>{decisionNote}</Text>
          </>
        ) : null}
      </Section>

      {isApproved ? (
        <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 24px' }}>
          Your lease has been updated. Your next payment due date has been adjusted to reflect the new term.
        </Text>
      ) : (
        <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 24px' }}>
          If you have questions about this decision, please contact the administration team.
        </Text>
      )}

      <Text style={{ fontSize: 14, color: COLORS.stone700, margin: 0 }}>
        <a href={leaseUrl} style={{ color: COLORS.green700 }}>View your lease details →</a>
      </Text>
    </EmailLayout>
  )
}

export async function renderRentalExtensionDecision(data: RentalExtensionDecisionData): Promise<string> {
  return render(<RentalExtensionDecisionEmail {...data} />)
}
