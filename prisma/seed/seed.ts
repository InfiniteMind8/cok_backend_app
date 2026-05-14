import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  })
  return new PrismaClient({ adapter })
}

const db = createClient()

function generateMemberId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = 'K-'
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

async function main() {
  console.log('Seeding City of Karis database...')

  // ── System wallets ──────────────────────────────────────────────────────────
  const systemWalletKeys = [
    'community_fund',
    'operations_fund',
    'developer_share',
    'treasury_reserve',
    'settlement_burn',
  ] as const

  const systemWallets: Record<string, { id: string }> = {}

  for (const key of systemWalletKeys) {
    const wallet = await db.wallet.upsert({
      where: { systemKey: key },
      update: {},
      create: { isSystem: true, systemKey: key },
    })
    systemWallets[key] = wallet
    console.log(`  System wallet: ${key}`)
  }

  // Throw on missing keys/emails so callers see a clear error instead of
  // Prisma rejecting `undefined`. Both maps are populated above before any
  // call site below.
  const sysWalletId = (key: string): string => {
    const w = systemWallets[key]
    if (!w) throw new Error(`System wallet missing in seed: ${key}`)
    return w.id
  }
  const userId = (email: string): string => {
    const id = createdUsers[email]
    if (!id) throw new Error(`User missing in seed: ${email}`)
    return id
  }

  // ── Users & personal wallets ─────────────────────────────────────────────────
  const userData = [
    {
      email: 'karis@cityofkaris.com',
      fullName: 'Karis Munroe',
      role: 'MASTER_ADMIN' as const,
      status: 'ACTIVE' as const,
      initialBalance: 5000,
    },
    {
      email: 'naomi@cityofkaris.com',
      fullName: 'Naomi Wells',
      role: 'ADMIN' as const,
      status: 'ACTIVE' as const,
      initialBalance: 0,
    },
    {
      email: 'anjali@pereirawellness.com',
      fullName: 'Anjali Pereira',
      role: 'VENDOR' as const,
      status: 'ACTIVE' as const,
      initialBalance: 800,
    },
    {
      email: 'devon@example.com',
      fullName: 'Devon McKenzie',
      role: 'RESIDENT' as const,
      status: 'ACTIVE' as const,
      initialBalance: 1500,
    },
    {
      email: 'aaliyah@example.com',
      fullName: 'Aaliyah Singh',
      role: 'RESIDENT' as const,
      status: 'ACTIVE' as const,
      initialBalance: 1500,
    },
    {
      email: 'marcus@example.com',
      fullName: 'Marcus Bowen',
      role: 'VISITOR' as const,
      status: 'PENDING_KYC' as const,
      initialBalance: 200,
    },
  ]

  const createdUsers: Record<string, string> = {}

  for (const u of userData) {
    const memberId = generateMemberId()

    const user = await db.user.upsert({
      where: { email: u.email },
      update: { role: u.role, status: u.status },
      create: {
        memberId,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        status: u.status,
        vehiclePlates: [],
      },
    })
    createdUsers[u.email] = user.id

    // Ensure wallet exists
    const wallet = await db.wallet.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    })

    // Seed initial balance via a DEPOSIT transaction if > 0
    if (u.initialBalance > 0) {
      const existingTx = await db.transaction.findFirst({
        where: {
          type: 'DEPOSIT',
          initiatedBy: user.id,
          description: `Seed deposit — ${u.fullName}`,
        },
      })

      if (!existingTx) {
        const tx = await db.transaction.create({
          data: {
            type: 'DEPOSIT',
            description: `Seed deposit — ${u.fullName}`,
            initiatedBy: user.id,
          },
        })

        // Credit the user wallet
        await db.ledgerEntry.create({
          data: {
            transactionId: tx.id,
            walletId: wallet.id,
            amount: u.initialBalance,
            description: 'Initial K Credit deposit',
          },
        })

        // Debit the treasury reserve (double-entry)
        await db.ledgerEntry.create({
          data: {
            transactionId: tx.id,
            walletId: sysWalletId('treasury_reserve'),
            amount: -u.initialBalance,
            description: 'Treasury reserve backing',
          },
        })
      }

      console.log(`  User: ${u.fullName} (${u.role}) — K ${u.initialBalance}`)
    } else {
      console.log(`  User: ${u.fullName} (${u.role})`)
    }
  }

  // ── Treasury reserve seed balance (K 50,000 backing) ────────────────────────
  const existingTreasuryTx = await db.transaction.findFirst({
    where: {
      type: 'TREASURY_ADJUSTMENT',
      description: 'Initial treasury reserve',
    },
  })

  if (!existingTreasuryTx) {
    const tx = await db.transaction.create({
      data: {
        type: 'TREASURY_ADJUSTMENT',
        description: 'Initial treasury reserve',
        initiatedBy: userId('karis@cityofkaris.com'),
      },
    })
    await db.ledgerEntry.create({
      data: {
        transactionId: tx.id,
        walletId: sysWalletId('treasury_reserve'),
        amount: 50000,
        description: 'Starting treasury reserve — USD 50,000 equivalent',
      },
    })
    console.log('  Treasury reserve: K 50,000')
  }

  // ── Genesis fee schedule ─────────────────────────────────────────────────────
  await db.feeSchedule.upsert({
    where: { id: 'genesis-fee-schedule' },
    update: {},
    create: {
      id: 'genesis-fee-schedule',
      effectiveAt: new Date(Date.now() - 60_000), // 1 minute ago — immediately active
      createdBy: userId('karis@cityofkaris.com'),
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

  // ── Property demo data ──────────────────────────────────────────────────────

  const devonId = userId('devon@example.com')
  const aaliyahId = userId('aaliyah@example.com')

  // Devon — Ownership (Residence-A12)
  const existingA12 = await db.property.findFirst({ where: { code: 'RESIDENCE-A12' } })
  if (!existingA12) {
    const propA12 = await db.property.create({
      data: {
        code: 'RESIDENCE-A12',
        type: 'OWNERSHIP',
        category: 'RESIDENTIAL',
        address: '12 Sunrise Drive, City of Karis Phase 1, Guyana',
        totalPrice: 285000,
        specifications: {
          Bedrooms: '3',
          Bathrooms: '2.5',
          'Lot size': '0.4 acres',
          'Solar capacity': '12 kWh',
          Pool: 'Private',
          Garage: '2-car',
        },
        photos: [
          'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&q=80&fit=crop',
          'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1200&q=80&fit=crop',
          'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80&fit=crop',
          'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=80&fit=crop',
        ],
        documents: [],
      },
    })

    const ownership = await db.propertyOwnership.create({
      data: {
        propertyId: propA12.id,
        userId: devonId,
        ownershipPct: 100,
        contractDate: new Date('2025-10-01'),
      },
    })

    const installmentDefs = [
      { number: 1, dueDate: '2025-11-01', progressNote: 'Foundation works begin' },
      { number: 2, dueDate: '2026-01-01', progressNote: 'Foundation complete' },
      { number: 3, dueDate: '2026-03-01', progressNote: 'Structure frame complete' },
      { number: 4, dueDate: '2026-05-01', progressNote: 'Roof installed' },
      { number: 5, dueDate: '2026-07-01', progressNote: 'Interior works begin' },
      { number: 6, dueDate: '2026-09-01', progressNote: 'Keys handover' },
    ]

    const installments = await Promise.all(
      installmentDefs.map((inst) =>
        db.propertyInstallment.create({
          data: {
            propertyId: propA12.id,
            number: inst.number,
            dueDate: new Date(inst.dueDate),
            amount: 47500,
            progressNote: inst.progressNote,
          },
        }),
      ),
    )

    // Mark installments 1–4 as paid
    for (let i = 0; i < 4; i++) {
      const inst = installments[i]
      const def = installmentDefs[i]
      if (!inst || !def) continue
      await db.propertyPayment.create({
        data: {
          installmentId: inst.id,
          ownershipId: ownership.id,
          amount: 47500,
          paidAt: new Date(def.dueDate),
        },
      })
    }

    console.log('  Property: RESIDENCE-A12 (Devon — Ownership, 4/6 installments paid)')
  } else {
    console.log('  Property: RESIDENCE-A12 already exists — skipped')
  }

  // Aaliyah — Rental (Residence-B07)
  const existingB07 = await db.property.findFirst({ where: { code: 'RESIDENCE-B07' } })
  if (!existingB07) {
    const propB07 = await db.property.create({
      data: {
        code: 'RESIDENCE-B07',
        type: 'RENTAL',
        category: 'RESIDENTIAL',
        address: '7B Harbour View, City of Karis Phase 1, Guyana',
        specifications: {
          Bedrooms: '2',
          Bathrooms: '1.5',
          Floor: '3rd',
          Furnished: 'Yes',
          'Air conditioning': 'Split unit',
        },
        photos: [
          'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80&fit=crop',
          'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80&fit=crop',
          'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&q=80&fit=crop',
        ],
        documents: [],
      },
    })

    const tenancy = await db.propertyTenancy.create({
      data: {
        propertyId: propB07.id,
        userId: aaliyahId,
        cycle: 'monthly',
        cyclePayment: 1800,
        contractDate: new Date('2026-01-01'),
      },
    })

    const cycleMonths = [
      { cycleNumber: 1, paidAt: '2026-01-01' },
      { cycleNumber: 2, paidAt: '2026-02-01' },
      { cycleNumber: 3, paidAt: '2026-03-01' },
      { cycleNumber: 4, paidAt: '2026-04-01' },
    ]

    await Promise.all(
      cycleMonths.map((c) =>
        db.tenancyCyclePayment.create({
          data: {
            tenancyId: tenancy.id,
            cycleNumber: c.cycleNumber,
            amount: 1800,
            paidAt: new Date(c.paidAt),
          },
        }),
      ),
    )

    console.log('  Property: RESIDENCE-B07 (Aaliyah — Rental, 4 cycles paid)')
  } else {
    console.log('  Property: RESIDENCE-B07 already exists — skipped')
  }

  // ── Community demo content ────────────────────────────────────────────────────

  const karisId = userId('karis@cityofkaris.com')
  const naomiId = userId('naomi@cityofkaris.com')
  const marcusId = userId('marcus@example.com')

  const seedNow = new Date()
  const daysAgo = (n: number) => new Date(seedNow.getTime() - n * 24 * 60 * 60 * 1000)

  // Community updates (4)
  const updateDefs = [
    {
      headline: 'Solar phase 2 commissioning complete',
      category: 'Infrastructure',
      message:
        'Phase 2 of the City of Karis solar installation has been commissioned and is now live. The expanded capacity now powers all common areas, street lighting, and shared infrastructure 24/7. Residents will notice a reduction in energy costs in their next billing cycle. Our solar partner, SunTech Caribbean, will provide a full commissioning report at the next community meeting.',
      photoUrl: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=1200&q=80&fit=crop',
      publishedAt: daysAgo(12),
    },
    {
      headline: 'Welcome to our newest founding members',
      category: 'Welcome',
      message:
        'We are thrilled to welcome three new founding families who joined the City of Karis community this week. The McKenzies, the Singhs, and the Bowens bring our founding member count to 47. Each new member strengthens our collective and contributes to the vibrant, intentional community we are building together. Welcome home.',
      photoUrl: null as string | null,
      publishedAt: daysAgo(8),
    },
    {
      headline: 'New telemedicine schedule starting Monday',
      category: 'Wellness',
      message:
        'Starting Monday, our on-site telemedicine service will operate on an expanded schedule: Monday to Friday, 7am–7pm, and Saturday, 9am–1pm. The service is available to all active residents and their immediate family members at no additional cost. Book appointments through the Wellness tab or call the concierge desk.',
      photoUrl: null as string | null,
      publishedAt: daysAgo(3),
    },
    {
      headline: 'Karis Annual Festival — call for artist nominations',
      category: 'Events',
      message:
        'The first Karis Annual Festival is coming. We are calling on the community to nominate local artists, musicians, and performers to headline our inaugural celebration. Nominees should be submitted through the Events section by the end of this month. The festival committee will select a final lineup by the 15th. This is your celebration — help shape it.',
      photoUrl: null as string | null,
      publishedAt: daysAgo(0),
    },
  ]

  for (const def of updateDefs) {
    const existing = await db.communityUpdate.findFirst({ where: { headline: def.headline } })
    if (!existing) {
      await db.communityUpdate.create({
        data: {
          headline: def.headline,
          category: def.category,
          message: def.message,
          photoUrl: def.photoUrl,
          publishedBy: karisId,
          publishedAt: def.publishedAt,
        },
      })
      console.log(`  Update: "${def.headline}"`)
    } else {
      console.log(`  Update: "${def.headline}" already exists — skipped`)
    }
  }

  // Vote
  const voteHeadline = 'How should we direct the next K 25,000 from the Community Investment Fund?'
  const existingVote = await db.vote.findFirst({
    where: { headline: voteHeadline },
    include: { options: true },
  })

  let voteRow: { id: string; options: { id: string; label: string }[] }
  if (existingVote) {
    voteRow = existingVote
    console.log('  Vote: Community Investment Fund already exists — skipped')
  } else {
    const created = await db.vote.create({
      data: {
        headline: voteHeadline,
        description:
          'The Community Investment Fund grows with every transaction in Karis. This vote determines how the next K 25,000 allocation is deployed. Every Resident\'s voice shapes our shared future.',
        isOpen: true,
        createdBy: karisId,
        createdAt: daysAgo(2),
        options: {
          create: [
            {
              label: 'Open-air amphitheater',
              description:
                'Construct a 200-seat open-air amphitheater in the community park. The space would host cultural events, outdoor screenings, live music, and community gatherings. Designed for natural ventilation and evening use, it would become the social heart of Karis and a venue available to all members for private and community events.',
            },
            {
              label: 'Expanded wellness center',
              description:
                'Expand the current wellness facility with a dedicated yoga studio, two additional treatment rooms, a cold plunge pool, and a meditation garden. The expansion would allow us to bring on two additional practitioners and increase our telemedicine capacity — making holistic health services accessible to every resident without leaving Karis.',
            },
            {
              label: 'Community library and co-working space',
              description:
                'Build a combined library and co-working facility with quiet reading areas, high-speed connectivity, private meeting pods, and a curated collection of over 2,000 books. The space would be open daily and serve as a knowledge hub for residents, with dedicated sections for children, entrepreneurs, and creatives working on projects within Karis.',
            },
          ],
        },
      },
    })
    // Re-fetch with options. Inline `include` on .create() doesn't always
    // narrow the return type under Prisma 7 — separate fetch keeps types clean.
    voteRow = await db.vote.findUniqueOrThrow({
      where: { id: created.id },
      include: { options: true },
    })
    console.log('  Vote: Community Investment Fund')
  }

  // Devon's vote submission (amphitheater — first option)
  const amphitheaterOption = voteRow.options[0]
  const existingSubmission = await db.voteSubmission.findFirst({
    where: { voteId: voteRow.id, userId: devonId },
  })
  if (!existingSubmission && amphitheaterOption) {
    await db.voteSubmission.create({
      data: {
        voteId: voteRow.id,
        optionId: amphitheaterOption.id,
        userId: devonId,
        submittedAt: daysAgo(1),
      },
    })
    console.log('  VoteSubmission: Devon → amphitheater')
  } else {
    console.log('  VoteSubmission: Devon already voted — skipped')
  }

  // Issues (2)
  const devonIssueMsgFragment = 'The garden maintenance team has not serviced our block'
  let devonIssue = await db.issue.findFirst({
    where: { message: { contains: devonIssueMsgFragment } },
  })
  if (!devonIssue) {
    devonIssue = await db.issue.create({
      data: {
        reporterId: devonId,
        seriousness: 'YELLOW' as const,
        urgency: 'YELLOW' as const,
        category: 'Maintenance',
        message:
          'The garden maintenance team has not serviced our block in three weeks. The common lawn between A10 and A14 is overgrown, the irrigation timers appear to be faulty, and two of the pathway lights have been out for over a week. This is affecting the appearance and safety of the area, particularly in the evenings.',
        status: 'IN_PROGRESS' as const,
        createdAt: daysAgo(6),
      },
    })
    await db.issueReply.create({
      data: {
        issueId: devonIssue.id,
        authorId: naomiId,
        message:
          "Hi Devon, thank you for raising this. I have escalated it to the grounds maintenance team and they have confirmed a visit for this Thursday. The irrigation fault will also be assessed — it appears to be a timer configuration issue affecting the A-block zone. The pathway lights are on the list for the electrician's next round, scheduled for Friday. We'll update the status once everything is resolved.",
        createdAt: daysAgo(3),
      },
    })
    console.log('  Issue: Devon — Maintenance (IN_PROGRESS)')
  } else {
    console.log('  Issue: Devon — Maintenance already exists — skipped')
  }

  const marcusIssueMsgFragment = 'I have been trying to understand how my K Credit balance is calculated'
  let marcusIssue = await db.issue.findFirst({
    where: { message: { contains: marcusIssueMsgFragment } },
  })
  if (!marcusIssue) {
    marcusIssue = await db.issue.create({
      data: {
        reporterId: marcusId,
        seriousness: 'YELLOW' as const,
        urgency: 'ORANGE' as const,
        category: 'Treasury',
        message:
          'I have been trying to understand how my K Credit balance is calculated after my last two purchases. The amounts deducted seem slightly higher than the listed prices. I would like a breakdown of any fees applied and confirmation of whether my account is set up correctly.',
        status: 'RESOLVED' as const,
        createdAt: daysAgo(10),
      },
    })
    await db.issueReply.create({
      data: {
        issueId: marcusIssue.id,
        authorId: naomiId,
        message:
          'Hi Marcus, thank you for reaching out. The difference you noticed is our standard 2.5% transaction fee, which covers the community fund, operations, and platform costs. This is applied to all purchase transactions and is detailed in the fee schedule in your wallet settings. Your account is correctly configured. We have marked this issue as resolved — please feel free to raise a new one if you have further questions.',
        createdAt: daysAgo(8),
      },
    })
    console.log('  Issue: Marcus — Treasury (RESOLVED)')
  } else {
    console.log('  Issue: Marcus — Treasury already exists — skipped')
  }

  // Devon's notifications (8, 4 unread)
  const devonUserWithNotifs = await db.user.findUnique({
    where: { id: devonId },
    include: { notifications: { select: { id: true } } },
  })

  if (devonUserWithNotifs?.notifications.length === 0) {
    const readAt = daysAgo(2)
    await db.notification.createMany({
      data: [
        {
          userId: devonId,
          type: 'COMMUNITY_UPDATE',
          title: 'Community update: Solar phase 2 commissioning complete',
          body: 'Phase 2 of the City of Karis solar installation has been commissioned and is now live.',
          link: '/community',
          priority: 'yellow',
          createdAt: daysAgo(12),
          readAt: null,
        },
        {
          userId: devonId,
          type: 'COMMUNITY_UPDATE',
          title: 'Community update: Welcome to our newest founding members',
          body: 'We are thrilled to welcome three new founding families who joined the City of Karis community.',
          link: '/community',
          priority: 'yellow',
          createdAt: daysAgo(8),
          readAt,
        },
        {
          userId: devonId,
          type: 'SETTLEMENT_SUBMITTED',
          title: 'Your settlement request has been submitted',
          body: 'Your settlement request is being reviewed and will be processed shortly.',
          link: '/wallet/settlements',
          priority: 'yellow',
          createdAt: daysAgo(7),
          readAt,
        },
        {
          userId: devonId,
          type: 'SETTLEMENT_APPROVED',
          title: 'Your settlement request has been approved',
          body: 'Your request has been approved and will be processed shortly.',
          link: '/wallet/settlements',
          priority: 'yellow',
          createdAt: daysAgo(5),
          readAt,
        },
        {
          userId: devonId,
          type: 'COMMUNITY_UPDATE',
          title: 'Community update: New telemedicine schedule starting Monday',
          body: 'Starting Monday, our on-site telemedicine service will operate on an expanded schedule.',
          link: '/community',
          priority: 'yellow',
          createdAt: daysAgo(5),
          readAt,
        },
        {
          userId: devonId,
          type: 'ISSUE_REPLY',
          title: 'A reply has been posted to your issue',
          body: 'The Admin team has responded to your Maintenance issue.',
          link: '/community/issues',
          priority: 'yellow',
          createdAt: daysAgo(3),
          readAt: null,
        },
        {
          userId: devonId,
          type: 'VOTE_OPEN',
          title: 'A new vote is open: How should we direct the next K 25,000?',
          body: 'Cast your vote in the Community tab.',
          link: '/community?tab=voting',
          priority: 'yellow',
          createdAt: daysAgo(1),
          readAt: null,
        },
        {
          userId: devonId,
          type: 'COMMUNITY_UPDATE',
          title: 'Community update: Karis Annual Festival — call for artist nominations',
          body: 'The first Karis Annual Festival is coming. Nominate local artists and performers.',
          link: '/community',
          priority: 'yellow',
          createdAt: daysAgo(0),
          readAt: null,
        },
      ],
    })
    console.log('  Notifications: 8 for Devon (4 unread)')
  } else {
    console.log('  Notifications: Devon already has notifications — skipped')
  }

  // ── C.1: Currency system wallets ─────────────────────────────────────────────

  for (const key of ['fiat_settlement', 'promotions'] as const) {
    await db.wallet.upsert({
      where: { systemKey: key },
      update: {},
      create: { isSystem: true, systemKey: key },
    })
    console.log(`  System wallet: ${key}`)
  }

  // ── C.1: Initial conversion rates ────────────────────────────────────────────

  type RateSeed = { base: 'KCRD' | 'USD' | 'GYD'; quote: 'KCRD' | 'USD' | 'GYD'; rate: string }
  const rateSeed: RateSeed[] = [
    { base: 'KCRD', quote: 'USD', rate: '1.00000000' },
    { base: 'USD', quote: 'KCRD', rate: '1.00000000' },
    { base: 'KCRD', quote: 'GYD', rate: '210.00000000' },
    { base: 'GYD', quote: 'KCRD', rate: '0.00476190' },
    { base: 'USD', quote: 'GYD', rate: '210.00000000' },
    { base: 'GYD', quote: 'USD', rate: '0.00476190' },
  ]

  const seedFrom = new Date(Date.now() - 60_000) // 1 minute ago
  const karisUser = await db.user.findFirst({ where: { email: 'karis@cityofkaris.com' }, select: { id: true } })
  const setBy = karisUser?.id ?? 'system'

  for (const r of rateSeed) {
    const existing = await db.conversionRate.findFirst({
      where: { baseCurrency: r.base, quoteCurrency: r.quote, effectiveTo: null },
    })
    if (!existing) {
      await db.conversionRate.create({
        data: { baseCurrency: r.base, quoteCurrency: r.quote, rate: r.rate, effectiveFrom: seedFrom, setBy },
      })
      console.log(`  Rate: ${r.base} → ${r.quote} = ${r.rate}`)
    } else {
      console.log(`  Rate: ${r.base} → ${r.quote} already set — skipped`)
    }
  }

  console.log('\nSeed complete.')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
