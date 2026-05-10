import { Section, Text } from '@react-email/components'
import * as React from 'react'
import { render } from '@react-email/render'
import { EmailLayout, COLORS } from './_layout.js'

export interface EmergencyBroadcastData {
  recipientName: string
  headline: string
  message: string
  sentAt: string
  severity?: 'INFO' | 'URGENT' | 'CRITICAL'
  actionUrl?: string
  actionLabel?: string
}

type SeverityStyle = {
  background: string
  border: string
  labelColor: string
  label: string
  preview: string
}

function severityStyle(severity: 'INFO' | 'URGENT' | 'CRITICAL'): SeverityStyle {
  switch (severity) {
    case 'INFO':
      return {
        background: '#EFF6FF',
        border: COLORS.info,
        labelColor: COLORS.info,
        label: 'Community Notice',
        preview: '',
      }
    case 'CRITICAL':
      return {
        background: '#FDF2F2',
        border: COLORS.danger,
        labelColor: COLORS.danger,
        label: 'Critical Alert',
        preview: 'CRITICAL: ',
      }
    case 'URGENT':
    default:
      return {
        background: '#FFFBEB',
        border: COLORS.warning,
        labelColor: COLORS.warning,
        label: 'Urgent Notice',
        preview: 'URGENT: ',
      }
  }
}

function EmergencyBroadcastEmail({
  recipientName,
  headline,
  message,
  sentAt,
  severity = 'URGENT',
  actionUrl,
  actionLabel,
}: EmergencyBroadcastData) {
  const style = severityStyle(severity)

  return (
    <EmailLayout preview={`${style.preview}${headline}`}>
      <Section
        style={{
          backgroundColor: style.background,
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 24,
          border: `2px solid ${style.border}`,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: style.labelColor,
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: 2,
          }}
        >
          {style.label} — City of Karis
        </Text>
      </Section>

      <Text
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: COLORS.green900,
          fontFamily: 'Cambria, Georgia, serif',
          margin: '0 0 8px',
        }}
      >
        {headline}
      </Text>

      <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 24px' }}>
        Hello {recipientName},
      </Text>

      <Text
        style={{
          fontSize: 14,
          color: COLORS.stone900,
          lineHeight: 1.8,
          margin: '0 0 24px',
          whiteSpace: 'pre-line' as const,
        }}
      >
        {message}
      </Text>

      {actionUrl && actionLabel ? (
        <Text style={{ fontSize: 14, color: COLORS.stone700, margin: '0 0 16px' }}>
          <a href={actionUrl} style={{ color: COLORS.green700, fontWeight: 600 }}>
            {actionLabel} →
          </a>
        </Text>
      ) : null}

      <Text style={{ fontSize: 12, color: COLORS.stone500, margin: 0 }}>
        Sent at {sentAt} by City of Karis administration.
      </Text>
    </EmailLayout>
  )
}

export async function renderEmergencyBroadcast(data: EmergencyBroadcastData): Promise<string> {
  return render(<EmergencyBroadcastEmail {...data} />)
}
