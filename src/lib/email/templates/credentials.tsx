import { Button, Section, Text } from '@react-email/components'
import * as React from 'react'
import { render } from '@react-email/render'
import { EmailLayout, COLORS } from './_layout.js'

export interface CredentialsData {
  fullName: string
  email: string
  temporaryPassword: string
  loginUrl: string
}

function CredentialsEmail({ fullName, email, temporaryPassword, loginUrl }: CredentialsData) {
  return (
    <EmailLayout preview={`Your City of Karis login credentials`}>
      <Text style={{ fontSize: 20, fontWeight: 600, color: COLORS.green900, fontFamily: 'Cambria, Georgia, serif', margin: '0 0 8px' }}>
        Your login credentials.
      </Text>
      <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 24px' }}>
        Hello {fullName}, here are your City of Karis account credentials. Please sign in and change your password at your earliest convenience.
      </Text>

      <Section style={{ backgroundColor: COLORS.gold100, borderRadius: 8, padding: '16px 20px', marginBottom: 8, border: `1px solid ${COLORS.gold300}` }}>
        <Text style={{ fontSize: 12, color: COLORS.stone500, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>Email address</Text>
        <Text style={{ fontSize: 14, fontWeight: 600, color: COLORS.stone900, fontFamily: 'monospace', margin: 0 }}>{email}</Text>
      </Section>
      <Section style={{ backgroundColor: COLORS.gold100, borderRadius: 8, padding: '16px 20px', marginBottom: 24, border: `1px solid ${COLORS.gold300}` }}>
        <Text style={{ fontSize: 12, color: COLORS.stone500, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>Temporary password</Text>
        <Text style={{ fontSize: 14, fontWeight: 600, color: COLORS.stone900, fontFamily: 'monospace', margin: 0 }}>{temporaryPassword}</Text>
      </Section>

      <Text style={{ fontSize: 13, color: COLORS.warning, lineHeight: 1.6, margin: '0 0 24px' }}>
        For your security, you will be asked to set a new password on first sign-in.
      </Text>

      <Button
        href={loginUrl}
        style={{
          backgroundColor: COLORS.green900,
          color: COLORS.gold100,
          padding: '14px 28px',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        Sign in to Karis
      </Button>
    </EmailLayout>
  )
}

export async function renderCredentials(data: CredentialsData): Promise<string> {
  return render(<CredentialsEmail {...data} />)
}
