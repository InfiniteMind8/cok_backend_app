import { Prisma } from '@prisma/client'
import { db } from '../db.js'

export async function getProperties(page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize

  const [properties, total] = await Promise.all([
    db.property.findMany({
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        ownerships: {
          include: { user: { select: { fullName: true, memberId: true } } },
          orderBy: { contractDate: 'desc' },
          take: 1,
        },
        tenancies: {
          include: { user: { select: { fullName: true, memberId: true } } },
          orderBy: { contractDate: 'desc' },
          take: 1,
        },
        installments: {
          select: { amount: true },
        },
      },
    }),
    db.property.count(),
  ])

  const propertiesWithPaid = await Promise.all(
    properties.map(async (p) => {
      const totalPrice = p.totalPrice ?? new Prisma.Decimal(0)
      const paidAgg = await db.propertyPayment.aggregate({
        where: {
          installment: { propertyId: p.id },
        },
        _sum: { amount: true },
      })
      const paid = new Prisma.Decimal(paidAgg._sum.amount ?? 0)
      const paidPct = totalPrice.gt(0)
        ? paid.div(totalPrice).mul(100).toDecimalPlaces(1)
        : new Prisma.Decimal(0)

      return {
        ...p,
        primaryOwner: p.ownerships[0]?.user ?? null,
        primaryTenant: p.tenancies[0]?.user ?? null,
        paidPct,
      }
    }),
  )

  return { properties: propertiesWithPaid, total }
}

export async function getResidentProperty(userId: string) {
  const ownership = await db.propertyOwnership.findFirst({
    where: { userId },
    orderBy: { contractDate: 'desc' },
    include: {
      property: {
        include: {
          installments: {
            orderBy: { number: 'asc' },
            include: { payments: { select: { amount: true, proofUrl: true, paidAt: true } } },
          },
        },
      },
      payments: {
        include: { installment: { select: { number: true, dueDate: true } } },
        orderBy: { paidAt: 'desc' },
      },
    },
  })

  if (ownership) {
    const totalPrice = ownership.property.totalPrice ?? new Prisma.Decimal(0)
    const paidAgg = await db.propertyPayment.aggregate({
      where: { installment: { propertyId: ownership.propertyId } },
      _sum: { amount: true },
    })
    const paid = new Prisma.Decimal(paidAgg._sum.amount ?? 0)
    const paidPct = totalPrice.gt(0)
      ? paid.div(totalPrice).mul(100).toDecimalPlaces(1)
      : new Prisma.Decimal(0)

    const nextInstallment =
      ownership.property.installments.find((inst) => inst.payments.length === 0) ?? null

    return {
      kind: 'ownership' as const,
      ownership,
      property: ownership.property,
      paidPct,
      paidAmount: paid,
      totalPrice,
      outstanding: totalPrice.minus(paid),
      nextInstallment,
    }
  }

  const tenancy = await db.propertyTenancy.findFirst({
    where: { userId },
    orderBy: { contractDate: 'desc' },
    include: {
      property: true,
      cyclePayments: { orderBy: { paidAt: 'desc' }, take: 5 },
      rentalExtensionRequests: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          requestedNewEndDate: true,
          status: true,
          reason: true,
          decisionNote: true,
          createdAt: true,
        },
      },
    },
  })

  if (tenancy) {
    return {
      kind: 'tenancy' as const,
      tenancy,
      property: tenancy.property,
    }
  }

  return null
}

export type ResidentProperty = Exclude<Awaited<ReturnType<typeof getResidentProperty>>, null>

export async function getPropertyDetail(propertyId: string) {
  return db.property.findUnique({
    where: { id: propertyId },
    include: {
      ownerships: {
        include: {
          user: { select: { id: true, fullName: true, memberId: true, email: true } },
          payments: {
            include: { installment: { select: { number: true, dueDate: true } } },
            orderBy: { paidAt: 'desc' },
          },
        },
      },
      tenancies: {
        include: {
          user: { select: { id: true, fullName: true, memberId: true, email: true } },
          cyclePayments: { orderBy: { paidAt: 'desc' } },
        },
      },
      installments: {
        orderBy: { number: 'asc' },
        include: { payments: { select: { amount: true } } },
      },
    },
  })
}
