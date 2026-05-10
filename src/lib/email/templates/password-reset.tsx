import { Button, Text } from '@react-email/components'
import * as React from 'react'
import { render } from '@react-email/render'
import { EmailLayout, COLORS } from './_layout.js'

export interface PasswordResetData {
  fullName: string
  resetUrl: string
  expiresInMinutes: number
}

function PasswordResetEmail({ fullName, resetUrl, expiresInMinutes }: PasswordResetData) {
  return (
    <EmailLayout preview="Reset your City of Karis password">
      <Text style={{ fontSize: 20, fontWeight: 600, color: COLORS.green900, fontFamily: 'Cambria, Georgia, serif', margin: '0 0 8px' }}>
        Password reset request.
      </Text>
      <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 24px' }}>
        Hello {fullName}, we received a request to reset the password for your City of Karis account. If you did not make this request, you can safely ignore this message.
      </Text>

      <Button
        href={resetUrl}
        style={{
          backgroundColor: COLORS.green900,
          color: COLORS.gold100,
          padding: '14px 28px',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          textDecoration: 'none',
          display: 'inline-block',
          marginBottom: 24,
        }}
      >
        Reset my password
      </Button>

      <Text style={{ fontSize: 13, color: COLORS.stone500, lineHeight: 1.6, margin: 0 }}>
        This link will expire in {expiresInMinutes} minutes. If it has expired, request a new one from the sign-in page.
      </Text>
    </EmailLayout>
  )
}

export async function renderPasswordReset(data: PasswordResetData): Promise<string> {
  return render(<PasswordResetEmail {...data} />)
}
