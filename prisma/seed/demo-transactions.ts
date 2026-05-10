import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { recordDeposit } from '../ledger/deposits'
import { transferCredits } from '../ledger/service'
import { requestSettlement, approveSettlement } from '../ledger/settlements'
import { getAllWalletRows, formatKCredit } from '../ledger/balance'
import { reconcileTreasury } from '../ledger/reconciliation'

// Demo uses its own PrismaClient (same pattern as seed.ts)
// The ledger modules import from lib/db — we patch the global so they share the same instance
function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  return new PrismaClient({ adapter })
}

const client = createClient()

// Patch globalThis so lib/db.ts returns this same instance
;(globalThis as unknown as { prisma: PrismaClient }).prisma = client

async function main() {
  console.log('Running City of Karis demo transactions...\n')

  // ── Look up seeded users ─────────────────────────────────────────────────────
  const [devon, anjali, aaliyah, karis] = await Promise.all([
    client.user.findUniqueOrThrow({ where: { email: 'devon@example.com' } }),
    client.user.findUniqueOrThrow({ where: { email: 'anjali@pereirawellness.com' } }),
    client.user.findUniqueOrThrow({ where: { email: 'aaliyah@example.com' } }),
    client.user.findUniqueOrThrow({ where: { email: 'karis@cityofkaris.com' } }),
  ])

  const [devonWallet, anjaliWallet, aaliyahWallet] = await Promise.all([
    client.wallet.findUniqueOrThrow({ where: { userId: devon.id } }),
    client.wallet.findUniqueOrThrow({ where: { userId: anjali.id } }),
    client.wallet.findUniqueOrThrow({ where: { userId: aaliyah.id } }),
  ])

  // ── Op 1: Devon deposits K 500 ────────────────────────────────────────────────
  console.log('1. Devon deposits K 500...')
  await recordDeposit({
    userId: devon.id,
    fiatAmount: 500,
    paymentMethod: 'bank_transfer',
    recordedBy: karis.id,
  })
  console.log('   ✓ Deposit recorded\n')

  // ── Op 2: Devon purchases K 100 from Anjali (2.5% fee) ───────────────────────
  console.log('2. Devon purchases K 100 from Anjali (2.5% PURCHASE fee)...')
  const purchaseResult = await transferCredits({
    fromWalletId: devonWallet.id,
    toWalletId: anjaliWallet.id,
    amount: new Prisma.Decimal('100'),
    type: 'PURCHASE',
    description: 'Wellness session — Anjali Pereira',
    initiatedBy: devon.id,
  })
  console.log(`   ✓ tx ${purchaseResult.transactionId}`)
  console.log(`   Net to Anjali: ${formatKCredit(purchaseResult.netAmount)}`)
  console.log(`   Fee: ${formatKCredit(purchaseResult.feeSplit.totalFee)}\n`)

  // ── Op 3: Aaliyah barters K 50 with Devon (0% fee) ──────────────────────────
  console.log('3. Aaliyah barters K 50 with Devon (0% BARTER fee)...')
  const barterResult = await transferCredits({
    fromWalletId: aaliyahWallet.id,
    toWalletId: devonWallet.id,
    amount: new Prisma.Decimal('50'),
    type: 'BARTER',
    description: 'Barter exchange',
    initiatedBy: aaliyah.id,
  })
  console.log(`   ✓ tx ${barterResult.transactionId}`)
  console.log(`   Net to Devon: ${formatKCredit(barterResult.netAmount)} (no fee)\n`)

  // ── Op 4: Anjali requests settlement of K 75 ─────────────────────────────────
  console.log('4. Anjali requests settlement of K 75...')
  const settlementRequest = await requestSettlement({
    userId: anjali.id,
    amount: new Prisma.Decimal('75'),
    purpose: 'Monthly revenue withdrawal',
  })
  console.log(`   ✓ SettlementRequest ${settlementRequest.id} — PENDING_APPROVAL\n`)

  // ── Op 5: Karis (Master Admin) approves the settlement ──────────────────────
  console.log('5. Karis approves settlement...')
  const approved = await approveSettlement({
    settlementId: settlementRequest.id,
    approvedBy: karis.id,
  })
  console.log(`   ✓ SettlementRequest ${approved.id} — ${approved.status}\n`)

  // ── Print wallet balances ─────────────────────────────────────────────────────
  console.log('─'.repeat(60))
  console.log('WALLET BALANCES AFTER DEMO')
  console.log('─'.repeat(60))

  const rows = await getAllWalletRows()
  const colW = 30
  for (const row of rows) {
    const label = row.displayName.padEnd(colW)
    const type = (row.isSystem ? '[sys]' : '[usr]').padEnd(6)
    console.log(`${type} ${label} ${formatKCredit(row.balance).padStart(14)}`)
  }

  // ── Reconciliation check ──────────────────────────────────────────────────────
  const recon = await reconcileTreasury()
  console.log('─'.repeat(60))
  if (recon.isBalanced) {
    console.log(`Reconciliation: PASSED ✓  (issued ${formatKCredit(recon.totalIssued)} = entries ${formatKCredit(recon.sumAllEntries)})`)
  } else {
    console.log(`Reconciliation: FAILED ✗  discrepancy ${formatKCredit(recon.discrepancy)}`)
    process.exit(1)
  }
}

main()
  .catch((e) => {
    console.error('Demo failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await client.$disconnect()
  })
