import { Section, Text } from '@react-email/components'
import * as React from 'react'
import { render } from '@react-email/render'
import { EmailLayout, COLORS } from './_layout.js'

export interface VoucherDeliveryData {
  recipientName: string
  voucherCode: string
  amountKcrd: string
  description: string
  expiresAt?: string
  redeemUrl: string
}

function VoucherDeliveryEmail({ recipientName, voucherCode, amountKcrd, description, expiresAt, redeemUrl }: VoucherDeliveryData) {
  return (
    <EmailLayout preview={`Your K Credit voucher — ${amountKcrd} KCRD`}>
      <Text style={{ fontSize: 20, fontWeight: 600, color: COLORS.green900, fontFamily: 'Cambria, Georgia, serif', margin: '0 0 8px' }}>
        Your voucher has arrived.
      </Text>
      <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 24px' }}>
        Hello {recipientName}, a K Credit voucher has been issued to your account.
      </Text>

      {description ? (
        <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 24px' }}>
          {description}
        </Text>
      ) : null}

      <Section style={{ backgroundColor: COLORS.gold100, borderRadius: 8, padding: '20px 24px', marginBottom: 8, border: `1px solid ${COLORS.gold300}`, textAlign: 'center' as const }}>
        <Text style={{ fontSize: 12, color: COLORS.stone500, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Voucher value</Text>
        <Text style={{ fontSize: 28, fontWeight: 700, color: COLORS.gold700, fontFamily: 'monospace', margin: '0 0 8px' }}>{amountKcrd} KCRD</Text>
        <Text style={{ fontSize: 12, color: COLORS.stone500, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Voucher code</Text>
        <Text style={{ fontSize: 18, fontWeight: 600, color: COLORS.stone900, fontFamily: 'monospace', margin: 0 }}>{voucherCode}</Text>
      </Section>

      {expiresAt ? (
        <Text style={{ fontSize: 13, color: COLORS.stone500, margin: '0 0 24px' }}>
          This voucher expires on {expiresAt}.
        </Text>
      ) : (
        <Text style={{ fontSize: 13, color: COLORS.stone500, margin: '0 0 24px' }}>
          This voucher has no expiry date.
        </Text>
      )}

      <Text style={{ fontSize: 14, color: COLORS.stone700, lineHeight: 1.6, margin: '0 0 8px' }}>
        Sign in to your Karis wallet to redeem this voucher:
        <br />
        <a href={redeemUrl} style={{ color: COLORS.green700 }}>{redeemUrl}</a>
      </Text>
    </EmailLayout>
  )
}

export async function renderVoucherDelivery(data: VoucherDeliveryData): Promise<string> {
  return render(<VoucherDeliveryEmail {...data} />)
}
