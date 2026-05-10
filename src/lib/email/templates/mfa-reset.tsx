import { Section, Text } from '@react-email/components'
import * as React from 'react'
import { render } from '@react-email/render'
import { EmailLayout, COLORS } from './_layout.js'

export interface MfaResetData {
  recipientName: string
  resetByAdminName: string
  resetAt: string
  enrollUrl: string
}

function MfaResetEmail({ recipientName, resetByAdminName, resetAt, enrollUrl }: MfaResetData) {
  return (
    <EmailLayout preview="Your two-factor authentication has been reset by an administrator.">
      <Section
        style={{
          backgroundColor: '#FDF2F2',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 24,
          border: `1px solid ${COLORS.danger}`,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: COLORS.danger,
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: 2,
          }}
        >
          Security Notice — City of Karis
        </Text>
      </Section>

      <Text
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: COLORS.green900,
          fontFamily: 'Cambria, Georgia, serif',
          margin: '0 0 16px',
        }}
      >
        Two-factor authentication reset
      </Text>

      <Text
        style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 16px' }}
      >
        Hello {recipientName},
      </Text>

      <Text
        style={{ fontSize: 14, color: COLORS.stone900, lineHeight: 1.8, margin: '0 0 24px' }}
      >
        Your two-factor authentication (2FA) has been reset by an administrator (
        {resetByAdminName}) at {resetAt}. You will be required to re-enrol the next
        time you sign in to your staff account.
      </Text>

      <Text
        style={{ fontSize: 14, color: COLORS.stone700, margin: '0 0 16px' }}
      >
        <a href={enrollUrl} style={{ color: COLORS.green700, fontWeight: 600 }}>
          Set up two-factor authentication →
        </a>
      </Text>

      <Text style={{ fontSize: 12, color: COLORS.stone500, margin: 0 }}>
        If you did not expect this change, contact your Master Administrator immediately.
      </Text>
    </EmailLayout>
  )
}

export async function renderMfaReset(data: MfaResetData): Promise<string> {
  return render(<MfaResetEmail {...data} />)
}
