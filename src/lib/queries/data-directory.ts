import { AttachmentEntityType } from '@prisma/client'
import { db } from '../db.js'
import { getWalletBalance } from '../ledger/balance.js'
import { getAttachmentsByEntity } from '../storage/attachments.js'
import { getEntityAuditLogs } from './audit-log.js'

export interface TreeUser {
  id: string
  fullName: string
  email: string
  memberId: string
  role: string
  status: string
}

export interface TreeProperty {
  id: string
  code: string
  type: string
  address: string | null
}

export interface TreeLease {
  id: string
  propertyCode: string
  userName: string
  leaseStatus: string
}

export interface TreeIssue {
  id: string
  title: string | null
  category: string
  status: string
  reporterName: string
}

export async function getDirectoryTree(search?: string) {
  const searchFilter = search
    ? {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { memberId: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const [users, properties, leases, issues] = await Promise.all([
    db.user.findMany({
      where: searchFilter,
      select: { id: true, fullName: true, email: true, memberId: true, role: true, status: true },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    }),
    db.property.findMany({
      where: search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' as const } },
              { address: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {},
      select: { id: true, code: true, type: true, address: true },
      orderBy: { code: 'asc' },
    }),
    db.propertyTenancy.findMany({
      select: {
        id: true,
        leaseStatus: true,
        property: { select: { code: true } },
        user: { select: { fullName: true } },
      },
      orderBy: { property: { code: 'asc' } },
    }),
    db.issue.findMany({
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        reporter: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ])

  return {
    users: users as TreeUser[],
    properties: properties as TreeProperty[],
    leases: leases.map((l) => ({
      id: l.id,
      propertyCode: l.property.code,
      userName: l.user.fullName,
      leaseStatus: l.leaseStatus,
    })) as TreeLease[],
    issues: issues.map((i) => ({
      id: i.id,
      title: i.title,
      category: i.category,
      status: i.status,
      reporterName: i.reporter.fullName,
    })) as TreeIssue[],
  }
}

export async function getUserEntityDetail(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      wallet: { select: { id: true } },
      ownedProperties: { include: { property: { select: { code: true, type: true } } } },
      rentedProperties: { include: { property: { select: { code: true, type: true } } } },
      visitorProfile: true,
      vendorProfile: true,
    },
  })
  if (!user) return null

  const [walletBalance, attachments, auditEntries, ledgerEntries] = await Promise.all([
    user.wallet ? getWalletBalance(user.wallet.id) : Promise.resolve(null),
    getAttachmentsByEntity(AttachmentEntityType.USER, userId),
    getEntityAuditLogs('User', userId, 100),
    user.wallet
      ? db.ledgerEntry.findMany({
          where: { walletId: user.wallet.id },
          include: { transaction: { select: { type: true, description: true, createdAt: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        })
      : Promise.resolve([]),
  ])

  return {
    type: 'User' as const,
    entity: user,
    walletBalance,
    attachments,
    auditEntries,
    ledgerEntries,
  }
}

export async function getPropertyEntityDetail(propertyId: string) {
  const property = await db.property.findUnique({
    where: { id: propertyId },
    include: {
      ownerships: { include: { user: { select: { fullName: true, email: true } } } },
      tenancies: { include: { user: { select: { fullName: true, email: true } } } },
      issues: { select: { id: true, title: true, status: true, category: true } },
    },
  })
  if (!property) return null

  const [attachments, auditEntries] = await Promise.all([
    getAttachmentsByEntity(AttachmentEntityType.PROPERTY, propertyId),
    getEntityAuditLogs('Property', propertyId, 100),
  ])

  return { type: 'Property' as const, entity: property, attachments, auditEntries }
}

export async function getLeaseEntityDetail(leaseId: string) {
  const lease = await db.propertyTenancy.findUnique({
    where: { id: leaseId },
    include: {
      property: { select: { code: true, type: true, address: true } },
      user: { select: { fullName: true, email: true, memberId: true } },
      cyclePayments: { orderBy: { cycleNumber: 'asc' } },
      rentalExtensionRequests: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!lease) return null

  const [attachments, auditEntries] = await Promise.all([
    getAttachmentsByEntity(AttachmentEntityType.LEASE, leaseId),
    getEntityAuditLogs('PropertyTenancy', leaseId, 50),
  ])

  return { type: 'Lease' as const, entity: lease, attachments, auditEntries }
}

export async function getIssueEntityDetail(issueId: string) {
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    include: {
      reporter: { select: { fullName: true, email: true } },
      assignee: { select: { fullName: true, email: true } },
      property: { select: { code: true } },
      replies: { include: { issue: false }, orderBy: { createdAt: 'asc' } },
    },
  })
  if (!issue) return null

  const [attachments, auditEntries] = await Promise.all([
    getAttachmentsByEntity(AttachmentEntityType.ISSUE, issueId),
    getEntityAuditLogs('Issue', issueId, 50),
  ])

  return { type: 'Issue' as const, entity: issue, attachments, auditEntries }
}
