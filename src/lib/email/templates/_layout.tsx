import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
  Hr,
} from '@react-email/components'
import * as React from 'react'

// Brand tokens (hex — email clients do not support OKLCH or CSS variables)
export const COLORS = {
  green900: '#1F2E26',
  green700: '#3A5A4D',
  green500: '#5B7E70',
  green100: '#DCE8E2',
  gold700: '#8C7035',
  gold500: '#B89548',
  gold300: '#D4B878',
  gold100: '#F2E8D0',
  stone900: '#2A2521',
  stone700: '#5C544C',
  stone500: '#8C857B',
  stone300: '#C4BEB6',
  stone100: '#F0EBE3',
  stone050: '#FAF7F2',
  surface: '#FFFFFF',
  success: '#3F8A5C',
  warning: '#C58A2D',
  danger: '#B23A3A',
  info: '#3A6E8C',
}

interface EmailLayoutProps {
  preview: string
  children: React.ReactNode
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: COLORS.stone050, margin: 0, padding: 0, fontFamily: 'Calibri, Arial, sans-serif' }}>
        <Container style={{ maxWidth: 560, margin: '0 auto', padding: '32px 16px' }}>
          {/* Header */}
          <Section style={{ backgroundColor: COLORS.green900, borderRadius: '12px 12px 0 0', padding: '24px 32px', textAlign: 'center' }}>
            <Text style={{ margin: 0, fontSize: 22, fontWeight: 600, color: COLORS.gold100, fontFamily: 'Cambria, Georgia, serif', letterSpacing: 1 }}>
              City of Karis
            </Text>
            <Text style={{ margin: '4px 0 0', fontSize: 12, color: COLORS.green500, fontStyle: 'italic', fontFamily: 'Calibri, Arial, sans-serif' }}>
              A community, by design.
            </Text>
          </Section>

          {/* Card body */}
          <Section style={{ backgroundColor: COLORS.surface, borderRadius: '0 0 12px 12px', padding: '32px', border: `1px solid ${COLORS.stone300}`, borderTop: 'none' }}>
            {children}
          </Section>

          {/* Footer */}
          <Hr style={{ borderColor: COLORS.stone300, margin: '24px 0 16px' }} />
          <Text style={{ fontSize: 11, color: COLORS.stone500, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
            City of Karis Community App · Guyana
            <br />
            This is a transactional message sent to members of the City of Karis community.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
