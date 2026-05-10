import { Section, Text } from '@react-email/components'
import * as React from 'react'
import { render } from '@react-email/render'
import { EmailLayout, COLORS } from './_layout.js'

export interface LeaseEndingSoonData {
  residentName: string
  propertyCode: string
  endDate: string
  daysUntilEnd: number
  propertyUrl: string
}

function LeaseEndingSoonEmail({
  residentName,
  propertyCode,
  endDate,
  daysUntilEnd,
  propertyUrl,
}: LeaseEndingSoonData) {
  return (
    <EmailLayout preview={`Your lease for ${propertyCode} ends in ${daysUntilEnd} days — ${endDate}`}>
      <Section
        style={{
          backgroundColor: COLORS.gold100,
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 24,
          border: `1px solid ${COLORS.gold500}`,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: COLORS.gold700,
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: 2,
          }}
        >
          Lease Notice — City of Karis
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
        Your lease is ending soon.
      </Text>

      <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 16px' }}>
        Hello {residentName},
      </Text>

      <Text style={{ fontSize: 14, color: COLORS.stone900, lineHeight: 1.8, margin: '0 0 24px' }}>
        Your lease for the property below will end in{' '}
        <strong>{daysUntilEnd} day{daysUntilEnd !== 1 ? 's' : ''}</strong>, on{' '}
        <strong>{endDate}</strong>. If you wish to extend your tenancy, please submit an
        extension request before the lease end date.
      </Text>

      <Section
        style={{
          backgroundColor: COLORS.stone050,
          borderRadius: 8,
          padding: '16px 20px',
          marginBottom: 24,
          border: `1px solid ${COLORS.stone300}`,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            color: COLORS.stone500,
            margin: '0 0 4px',
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Property
        </Text>
        <Text
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: COLORS.stone900,
            fontFamily: 'monospace',
            margin: '0 0 4px',
          }}
        >
          {propertyCode}
        </Text>
        <Text style={{ fontSize: 13, color: COLORS.stone500, margin: 0 }}>
          Lease end date: {endDate}
        </Text>
      </Section>

      <Text style={{ fontSize: 14, color: COLORS.stone700, margin: '0 0 24px' }}>
        <a href={propertyUrl} style={{ color: COLORS.green700, fontWeight: 600 }}>
          Request a lease extension →
        </a>
      </Text>

      <Text style={{ fontSize: 12, color: COLORS.stone500, margin: 0 }}>
        If you do not take any action, your tenancy will end on {endDate} and the property
        will be returned to the City of Karis housing pool.
      </Text>
    </EmailLayout>
  )
}

export async function renderLeaseEndingSoon(data: LeaseEndingSoonData): Promise<string> {
  return render(<LeaseEndingSoonEmail {...data} />)
}
