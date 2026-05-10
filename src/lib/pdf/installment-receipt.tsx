import {
  renderToBuffer,
  Document,
  Page,
  Text,
  View,
  Canvas,
  StyleSheet,
} from '@react-pdf/renderer'

export interface ReceiptData {
  installmentNumber: number
  propertyCode: string
  amount: string
  dueDate: string
  paidAt: string
  memberName: string
  memberId: string
  treasuryAdmin: string
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    backgroundColor: '#FDFCFB',
    padding: 48,
    fontSize: 11,
    color: '#3A3028',
  },
  header: {
    marginBottom: 28,
    borderBottom: '1 solid #EDE8E3',
    paddingBottom: 18,
  },
  wordmark: {
    fontSize: 22,
    letterSpacing: 1,
    color: '#1E2E23',
    marginBottom: 4,
  },
  tagline: {
    fontSize: 9,
    color: '#8C7E72',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 17,
    color: '#1E2E23',
    marginBottom: 18,
    marginTop: 10,
  },
  amountBox: {
    backgroundColor: '#1E2E23',
    padding: 16,
    borderRadius: 4,
    marginBottom: 22,
    marginTop: 6,
  },
  amountLabel: {
    color: '#A8946A',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  amountValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottom: '0.5 solid #EDE8E3',
  },
  label: {
    color: '#8C7E72',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 11,
    color: '#3A3028',
    textAlign: 'right',
    maxWidth: '60%',
  },
  footer: {
    marginTop: 28,
    paddingTop: 14,
    borderTop: '1 solid #EDE8E3',
  },
  footerText: {
    fontSize: 8,
    color: '#8C7E72',
    textAlign: 'center',
  },
})

export async function renderInstallmentReceiptPdf(data: ReceiptData): Promise<Buffer> {
  const doc = (
    <Document>
      <Page size="A5" style={styles.page}>
        {/* Watermark layer — rendered behind content */}
        <Canvas
          style={{ position: 'absolute', top: 0, left: 0, width: 419, height: 595 }}
          paint={(painter, w, h) => {
            painter.save()
            painter.fillColor('#1E2E23').opacity(0.04).fontSize(14)
            painter.rotate(-45, { origin: [w / 2, h / 2] })
            for (let row = -h; row < h * 2; row += 80) {
              for (let col = -w; col < w * 2; col += 200) {
                painter.text('City of Karis', col, row, { lineBreak: false })
              }
            }
            painter.restore()
            return null
          }}
        />

        <View style={styles.header}>
          <Text style={styles.wordmark}>City of Karis</Text>
          <Text style={styles.tagline}>Beautiful, Empowered Living in Guyana</Text>
        </View>

        <Text style={styles.title}>Installment Receipt</Text>

        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>Amount</Text>
          <Text style={styles.amountValue}>{data.amount}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Installment</Text>
          <Text style={styles.value}>#{data.installmentNumber}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Property</Text>
          <Text style={styles.value}>{data.propertyCode}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Due date</Text>
          <Text style={styles.value}>{data.dueDate}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Paid on</Text>
          <Text style={styles.value}>{data.paidAt}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Member</Text>
          <Text style={styles.value}>{data.memberName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Member ID</Text>
          <Text style={styles.value}>{data.memberId}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Signed by</Text>
          <Text style={styles.value}>{data.treasuryAdmin}</Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {'This receipt confirms payment toward your City of Karis property ownership.\nK Credits are backed 1:1 by Treasury reserves.'}
          </Text>
        </View>
      </Page>
    </Document>
  )

  return renderToBuffer(doc) as Promise<Buffer>
}
