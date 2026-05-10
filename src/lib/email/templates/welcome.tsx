import { Button, Section, Text } from '@react-email/components'
import * as React from 'react'
import { render } from '@react-email/render'
import { EmailLayout, COLORS } from './_layout.js'

export interface WelcomeData {
  fullName: string
  memberId: string
  role: string
  loginUrl: string
}

function WelcomeEmail({ fullName, memberId, role, loginUrl }: WelcomeData) {
  return (
    <EmailLayout preview={`Welcome to City of Karis, ${fullName}`}>
      <Text style={{ fontSize: 20, fontWeight: 600, color: COLORS.green900, fontFamily: 'Cambria, Georgia, serif', margin: '0 0 8px' }}>
        Welcome to Karis.
      </Text>
      <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 24px' }}>
        Hello {fullName}, your account has been created. You are joining the City of Karis community as a <strong>{role.toLowerCase().replace('_', ' ')}</strong>.
      </Text>

      <Section style={{ backgroundColor: COLORS.green100, borderRadius: 8, padding: '16px 20px', marginBottom: 24 }}>
        <Text style={{ fontSize: 12, color: COLORS.stone500, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>Your Member ID</Text>
        <Text style={{ fontSize: 20, fontWeight: 600, color: COLORS.green900, fontFamily: 'monospace', margin: 0 }}>{memberId}</Text>
      </Section>

      <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 24px' }}>
        Sign in to access your community dashboard, wallet, and community updates.
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

export async function renderWelcome(data: WelcomeData): Promise<string> {
  return render(<WelcomeEmail {...data} />)
}
