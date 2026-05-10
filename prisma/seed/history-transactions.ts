import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { transferCredits } from '../../src/lib/ledger/service.js'

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  return new PrismaClient({ adapter })
}

const client = createClient()
;(globalThis as unknown as { prisma: PrismaClient }).prisma = client

const now = new Date()
function daysAgo(n: number): Date {
  return new Date(now.getTime() - n * 24 * 60 * 60 * 1000)
}

async function backdate(transactionId: string, date: Date) {
  await Promise.all([
    client.transaction.update({ where: { id: transactionId }, data: { createdAt: date } }),
    client.ledgerEntry.updateMany({ where: { transactionId }, data: { createdAt: date } }),
  ])
}

async function deposit(opts: {
  userId: string
  walletId: string
  treasuryReserveId: string
  amount: number
  description: string
  date: Date
}) {
  const tx = await client.transaction.create({
    data: {
      type: 'DEPOSIT',
      description: opts.description,
      initiatedBy: opts.userId,
    },
  })
  await client.ledgerEntry.createMany({
    data: [
      { transactionId: tx.id, walletId: opts.walletId, amount: opts.amount },
      { transactionId: tx.id, walletId: opts.treasuryReserveId, amount: -opts.amount },
    ],
  })
  await backdate(tx.id, opts.date)
  return tx.id
}

async function main() {
  console.log('Seeding history transactions...\n')

  // Idempotency guard — sentinel is Devon's payroll deposit
  const existing = await client.transaction.findFirst({
    where: { description: 'Payroll — community coordination', type: 'DEPOSIT' },
  })
  if (existing) {
    console.log('History transactions already seeded — skipped')
    return
  }

  // Look up users and wallets
  const [devon, aaliyah, anjali] = await Promise.all([
    client.user.findUniqueOrThrow({ where: { email: 'devon@example.com' } }),
    client.user.findUniqueOrThrow({ where: { email: 'aaliyah@example.com' } }),
    client.user.findUniqueOrThrow({ where: { email: 'anjali@pereirawellness.com' } }),
  ])

  const [devonWallet, aaliyahWallet, anjaliWallet, treasuryWallet] = await Promise.all([
    client.wallet.findUniqueOrThrow({ where: { userId: devon.id } }),
    client.wallet.findUniqueOrThrow({ where: { userId: aaliyah.id } }),
    client.wallet.findUniqueOrThrow({ where: { userId: anjali.id } }),
    client.wallet.findUniqueOrThrow({ where: { systemKey: 'treasury_reserve' } }),
  ])

  const D = devonWallet.id
  const A = aaliyahWallet.id
  const J = anjaliWallet.id
  const TR = treasuryWallet.id

  // 30 transactions — chronological order (oldest first)

  // 1. Aaliyah deposit K350 — 60 days ago
  await deposit({ userId: aaliyah.id, walletId: A, treasuryReserveId: TR, amount: 350, description: 'Payroll — administrative support', date: daysAgo(60) })
  console.log('1. Aaliyah deposit K350 — Payroll')

  // 2. Devon deposit K500 — 58 days ago [SENTINEL]
  await deposit({ userId: devon.id, walletId: D, treasuryReserveId: TR, amount: 500, description: 'Payroll — community coordination', date: daysAgo(58) })
  console.log('2. Devon deposit K500 — Payroll')

  // 3. Aaliyah → Anjali K65 PURCHASE — 57 days ago
  const tx3 = await transferCredits({ fromWalletId: A, toWalletId: J, amount: new Prisma.Decimal('65'), type: 'PURCHASE', description: 'Pereira Wellness — 60-min massage', initiatedBy: aaliyah.id })
  await backdate(tx3.transactionId, daysAgo(57))
  console.log('3. Aaliyah → Anjali K65 purchase')

  // 4. Devon → Anjali K85 PURCHASE — 55 days ago
  const tx4 = await transferCredits({ fromWalletId: D, toWalletId: J, amount: new Prisma.Decimal('85'), type: 'PURCHASE', description: 'Pereira Wellness — deep tissue massage', initiatedBy: devon.id })
  await backdate(tx4.transactionId, daysAgo(55))
  console.log('4. Devon → Anjali K85 purchase')

  // 5. Aaliyah → Anjali K130 PURCHASE — 52 days ago
  const tx5 = await transferCredits({ fromWalletId: A, toWalletId: J, amount: new Prisma.Decimal('130'), type: 'PURCHASE', description: 'Supermarket — weekly groceries', initiatedBy: aaliyah.id })
  await backdate(tx5.transactionId, daysAgo(52))
  console.log('5. Aaliyah → Anjali K130 purchase')

  // 6. Devon → Anjali K60 PURCHASE — 50 days ago
  const tx6 = await transferCredits({ fromWalletId: D, toWalletId: J, amount: new Prisma.Decimal('60'), type: 'PURCHASE', description: 'Telemedicine consult — Dr. Patel', initiatedBy: devon.id })
  await backdate(tx6.transactionId, daysAgo(50))
  console.log('6. Devon → Anjali K60 purchase')

  // 7. Aaliyah → Devon K80 BARTER — 48 days ago
  const tx7 = await transferCredits({ fromWalletId: A, toWalletId: D, amount: new Prisma.Decimal('80'), type: 'BARTER', description: 'Babysitting — 4 hours', initiatedBy: aaliyah.id })
  await backdate(tx7.transactionId, daysAgo(48))
  console.log('7. Aaliyah → Devon K80 barter')

  // 8. Devon → Anjali K220 PURCHASE — 45 days ago
  const tx8 = await transferCredits({ fromWalletId: D, toWalletId: J, amount: new Prisma.Decimal('220'), type: 'PURCHASE', description: 'Karis Atelier — perfume oils set', initiatedBy: devon.id })
  await backdate(tx8.transactionId, daysAgo(45))
  console.log('8. Devon → Anjali K220 purchase')

  // 9. Aaliyah → Anjali K60 PURCHASE — 43 days ago
  const tx9 = await transferCredits({ fromWalletId: A, toWalletId: J, amount: new Prisma.Decimal('60'), type: 'PURCHASE', description: 'Telemedicine consult — Dr. Patel', initiatedBy: aaliyah.id })
  await backdate(tx9.transactionId, daysAgo(43))
  console.log('9. Aaliyah → Anjali K60 purchase')

  // 10. Devon deposit K35 — 40 days ago
  await deposit({ userId: devon.id, walletId: D, treasuryReserveId: TR, amount: 35, description: 'Solar credit — surplus generation', date: daysAgo(40) })
  console.log('10. Devon deposit K35 — Solar credit')

  // 11. Aaliyah deposit K35 — 40 days ago
  await deposit({ userId: aaliyah.id, walletId: A, treasuryReserveId: TR, amount: 35, description: 'Solar credit — surplus generation', date: daysAgo(40) })
  console.log('11. Aaliyah deposit K35 — Solar credit')

  // 12. Devon → Aaliyah K120 BARTER — 35 days ago
  const tx12 = await transferCredits({ fromWalletId: D, toWalletId: A, amount: new Prisma.Decimal('120'), type: 'BARTER', description: 'Landscape consultation — garden redesign', initiatedBy: devon.id })
  await backdate(tx12.transactionId, daysAgo(35))
  console.log('12. Devon → Aaliyah K120 barter')

  // 13. Aaliyah → Anjali K95 PURCHASE — 31 days ago
  const tx13 = await transferCredits({ fromWalletId: A, toWalletId: J, amount: new Prisma.Decimal('95'), type: 'PURCHASE', description: 'Karis Atelier — signature candle set', initiatedBy: aaliyah.id })
  await backdate(tx13.transactionId, daysAgo(31))
  console.log('13. Aaliyah → Anjali K95 purchase')

  // 14. Devon → Anjali K145 PURCHASE — 30 days ago
  const tx14 = await transferCredits({ fromWalletId: D, toWalletId: J, amount: new Prisma.Decimal('145'), type: 'PURCHASE', description: 'Supermarket — weekly groceries', initiatedBy: devon.id })
  await backdate(tx14.transactionId, daysAgo(30))
  console.log('14. Devon → Anjali K145 purchase')

  // 15. Aaliyah → Devon K45 BARTER — 28 days ago
  const tx15 = await transferCredits({ fromWalletId: A, toWalletId: D, amount: new Prisma.Decimal('45'), type: 'BARTER', description: 'Fresh-baked loaves — weekly exchange', initiatedBy: aaliyah.id })
  await backdate(tx15.transactionId, daysAgo(28))
  console.log('15. Aaliyah → Devon K45 barter')

  // 16. Devon → Anjali K120 PURCHASE — 25 days ago
  const tx16 = await transferCredits({ fromWalletId: D, toWalletId: J, amount: new Prisma.Decimal('120'), type: 'PURCHASE', description: 'Pereira Wellness — couples yoga', initiatedBy: devon.id })
  await backdate(tx16.transactionId, daysAgo(25))
  console.log('16. Devon → Anjali K120 purchase')

  // 17. Aaliyah → Devon K90 BARTER — 22 days ago
  const tx17 = await transferCredits({ fromWalletId: A, toWalletId: D, amount: new Prisma.Decimal('90'), type: 'BARTER', description: 'Home-cooked dinner — family meal', initiatedBy: aaliyah.id })
  await backdate(tx17.transactionId, daysAgo(22))
  console.log('17. Aaliyah → Devon K90 barter')

  // 18. Devon → Aaliyah K55 BARTER — 20 days ago
  const tx18 = await transferCredits({ fromWalletId: D, toWalletId: A, amount: new Prisma.Decimal('55'), type: 'BARTER', description: 'Furniture assembly help — half day', initiatedBy: devon.id })
  await backdate(tx18.transactionId, daysAgo(20))
  console.log('18. Devon → Aaliyah K55 barter')

  // 19. Devon deposit K35 — 18 days ago
  await deposit({ userId: devon.id, walletId: D, treasuryReserveId: TR, amount: 35, description: 'Solar credit — surplus generation', date: daysAgo(18) })
  console.log('19. Devon deposit K35 — Solar credit')

  // 20. Aaliyah → Anjali K125 PURCHASE — 18 days ago
  const tx20 = await transferCredits({ fromWalletId: A, toWalletId: J, amount: new Prisma.Decimal('125'), type: 'PURCHASE', description: 'Supermarket — weekly groceries', initiatedBy: aaliyah.id })
  await backdate(tx20.transactionId, daysAgo(18))
  console.log('20. Aaliyah → Anjali K125 purchase')

  // 21. Devon → Anjali K60 PURCHASE — 15 days ago
  const tx21 = await transferCredits({ fromWalletId: D, toWalletId: J, amount: new Prisma.Decimal('60'), type: 'PURCHASE', description: 'Telemedicine consult — Dr. Patel', initiatedBy: devon.id })
  await backdate(tx21.transactionId, daysAgo(15))
  console.log('21. Devon → Anjali K60 purchase')

  // 22. Aaliyah → Anjali K130 PURCHASE — 14 days ago
  const tx22 = await transferCredits({ fromWalletId: A, toWalletId: J, amount: new Prisma.Decimal('130'), type: 'PURCHASE', description: 'Pereira Wellness — facial & skin treatment', initiatedBy: aaliyah.id })
  await backdate(tx22.transactionId, daysAgo(14))
  console.log('22. Aaliyah → Anjali K130 purchase')

  // 23. Devon deposit K150 — 10 days ago
  await deposit({ userId: devon.id, walletId: D, treasuryReserveId: TR, amount: 150, description: 'Community investment dividend', date: daysAgo(10) })
  console.log('23. Devon deposit K150 — Dividend')

  // 24. Aaliyah deposit K150 — 10 days ago
  await deposit({ userId: aaliyah.id, walletId: A, treasuryReserveId: TR, amount: 150, description: 'Community investment dividend', date: daysAgo(10) })
  console.log('24. Aaliyah deposit K150 — Dividend')

  // 25. Aaliyah → Anjali K60 PURCHASE — 8 days ago
  const tx25 = await transferCredits({ fromWalletId: A, toWalletId: J, amount: new Prisma.Decimal('60'), type: 'PURCHASE', description: 'Telemedicine consult — Dr. Patel', initiatedBy: aaliyah.id })
  await backdate(tx25.transactionId, daysAgo(8))
  console.log('25. Aaliyah → Anjali K60 purchase')

  // 26. Devon → Anjali K145 PURCHASE — 7 days ago
  const tx26 = await transferCredits({ fromWalletId: D, toWalletId: J, amount: new Prisma.Decimal('145'), type: 'PURCHASE', description: 'Supermarket — weekly groceries', initiatedBy: devon.id })
  await backdate(tx26.transactionId, daysAgo(7))
  console.log('26. Devon → Anjali K145 purchase')

  // 27. Aaliyah → Devon K75 BARTER — 6 days ago
  const tx27 = await transferCredits({ fromWalletId: A, toWalletId: D, amount: new Prisma.Decimal('75'), type: 'BARTER', description: 'Document translation — legal forms', initiatedBy: aaliyah.id })
  await backdate(tx27.transactionId, daysAgo(6))
  console.log('27. Aaliyah → Devon K75 barter')

  // 28. Aaliyah → Anjali K42 PURCHASE — 5 days ago
  const tx28 = await transferCredits({ fromWalletId: A, toWalletId: J, amount: new Prisma.Decimal('42'), type: 'PURCHASE', description: 'Karis Farmers Market — fresh produce', initiatedBy: aaliyah.id })
  await backdate(tx28.transactionId, daysAgo(5))
  console.log('28. Aaliyah → Anjali K42 purchase')

  // 29. Devon → Anjali K180 PURCHASE — 3 days ago
  const tx29 = await transferCredits({ fromWalletId: D, toWalletId: J, amount: new Prisma.Decimal('180'), type: 'PURCHASE', description: 'Karis Atelier — handmade jewellery', initiatedBy: devon.id })
  await backdate(tx29.transactionId, daysAgo(3))
  console.log('29. Devon → Anjali K180 purchase')

  // 30. Aaliyah → Anjali K135 PURCHASE — 2 days ago
  const tx30 = await transferCredits({ fromWalletId: A, toWalletId: J, amount: new Prisma.Decimal('135'), type: 'PURCHASE', description: 'Supermarket — weekly groceries', initiatedBy: aaliyah.id })
  await backdate(tx30.transactionId, daysAgo(2))
  console.log('30. Aaliyah → Anjali K135 purchase')

  console.log('\n30 history transactions seeded successfully.')
}

main()
  .catch((e) => {
    console.error('History seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await client.$disconnect()
  })
