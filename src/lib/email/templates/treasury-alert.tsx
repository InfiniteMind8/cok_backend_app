import { Section, Text } from '@react-email/components'
import * as React from 'react'
import { render } from '@react-email/render'
import { EmailLayout, COLORS } from './_layout.js'

export interface TreasuryAlertData {
  recipientName: string
  discrepancy: string
  netSum: string
  reportUrl: string
  runAt: string
}

function TreasuryAlertEmail({ recipientName, discrepancy, netSum, reportUrl, runAt }: TreasuryAlertData) {
  return (
    <EmailLayout preview="Treasury reconciliation detected a discrepancy. Immediate review required.">
      <Section
        style={{
          backgroundColor: '#FEF3CD',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 24,
          border: `1px solid #D97706`,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#92400E',
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: 2,
          }}
        >
          Treasury Alert — City of Karis
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
        Reconciliation discrepancy detected
      </Text>

      <Text
        style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 16px' }}
      >
        Hello {recipientName},
      </Text>

      <Text
        style={{ fontSize: 14, color: COLORS.stone900, lineHeight: 1.8, margin: '0 0 24px' }}
      >
        The nightly treasury reconciliation run at {runAt} found that the ledger is not balanced.
        The net sum of all ledger entries is <strong>{netSum} KCRD</strong>, producing a
        discrepancy of <strong>{discrepancy} KCRD</strong>. This requires your immediate review.
      </Text>

      <Text
        style={{ fontSize: 14, color: COLORS.stone700, margin: '0 0 24px' }}
      >
        <a href={reportUrl} style={{ color: COLORS.green700, fontWeight: 600 }}>
          View full reconciliation report →
        </a>
      </Text>

      <Text style={{ fontSize: 12, color: COLORS.stone500, margin: 0 }}>
        A banner will appear on all admin pages until an administrator acknowledges this alert.
        Acknowledging does not clear the discrepancy — only manual ledger review can resolve it.
      </Text>
    </EmailLayout>
  )
}

export async function renderTreasuryAlert(data: TreasuryAlertData): Promise<string> {
  return render(<TreasuryAlertEmail {...data} />)
}
