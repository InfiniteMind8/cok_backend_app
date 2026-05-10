/**
 * Production seed — infrastructure only.
 *
 * Creates the 5 system wallets and genesis fee schedule required for the app
 * to function. Does NOT create demo users, demo transactions, or any content.
 *
 * The Master Admin account is created automatically via the Clerk webhook
 * on first sign-in.
 *
 * Safe to run multiple times — all operations are upserts.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  })
  return new PrismaClient({ adapter })
}

const db = createClient()

async function main() {
  console.log('Running production seed...')

  // ── System wallets ──────────────────────────────────────────────────────────
  const systemWalletKeys = [
    'community_fund',
    'operations_fund',
    'developer_share',
    'treasury_reserve',
    'settlement_burn',
  ] as const

  for (const key of systemWalletKeys) {
    await db.wallet.upsert({
      where: { systemKey: key },
      update: {},
      create: { isSystem: true, systemKey: key },
    })
    console.log(`  System wallet: ${key}`)
  }

  // ── Genesis fee schedule ──────────────────────────────���──────────────────────
  await db.feeSchedule.upsert({
    where: { id: 'genesis-fee-schedule' },
    update: {},
    create: {
      id: 'genesis-fee-schedule',
      effectiveAt: new Date(Date.now() - 60_000),
      createdBy: 'system',
      rules: {
        PURCHASE:            { totalPct: 2.5, communityFundPct: 1.5, operationsFundPct: 0.5, developerSharePct: 0.5 },
        VENDOR_SETTLEMENT:   { totalPct: 1.0, communityFundPct: 0.5, operationsFundPct: 0.5, developerSharePct: 0 },
        RESIDENT_SETTLEMENT: { totalPct: 1.0, communityFundPct: 0.5, operationsFundPct: 0.5, developerSharePct: 0 },
        VISITOR_SETTLEMENT:  { totalPct: 1.0, communityFundPct: 0.5, operationsFundPct: 0.5, developerSharePct: 0 },
        BARTER:              { totalPct: 0,   communityFundPct: 0,   operationsFundPct: 0,   developerSharePct: 0 },
        PAYROLL:             { totalPct: 0,   communityFundPct: 0,   operationsFundPct: 0,   developerSharePct: 0 },
        DEPOSIT:             { totalPct: 0,   communityFundPct: 0,   operationsFundPct: 0,   developerSharePct: 0 },
        TRANSFER:            { totalPct: 0,   communityFundPct: 0,   operationsFundPct: 0,   developerSharePct: 0 },
      },
    },
  })
  console.log('  Fee schedule: genesis-fee-schedule (active)')

  console.log('\nProduction seed complete.')
  console.log('Next steps:')
  console.log('  1. Sign in as Master Admin — your account will be created via Clerk webhook')
  console.log('  2. Record the first treasury deposit in Admin → Treasury')
  console.log('  3. Invite residents via Admin → Accounts → Create account')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
