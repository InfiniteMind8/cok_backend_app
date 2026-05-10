import { AnnouncementTargetType, type IssueLevel, type IssueStatus, type Role } from '@prisma/client'
import { db } from '../db.js'

export async function getUnreadNotificationCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } })
}

export async function getMyIssues(userId: string) {
  return db.issue.findMany({
    where: { reporterId: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      replies: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, authorId: true, message: true, createdAt: true },
      },
    },
  })
}

export async function getAdminVotes() {
  return db.vote.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      options: {
        include: {
          _count: { select: { submissions: true } },
          submissions: {
            select: {
              id: true,
              user: { select: { fullName: true, memberId: true } },
            },
          },
        },
      },
      _count: { select: { submissions: true } },
    },
  })
}

export async function getCommunityUpdates(page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize
  const [updates, total] = await Promise.all([
    db.communityUpdate.findMany({
      skip,
      take: pageSize,
      orderBy: { publishedAt: 'desc' },
      include: { _count: { select: { acknowledgements: true } } },
    }),
    db.communityUpdate.count(),
  ])
  return { updates, total }
}

export async function getVotes(filter: 'open' | 'closed' | 'all' = 'all') {
  const where =
    filter === 'open' ? { isOpen: true } : filter === 'closed' ? { isOpen: false } : {}

  return db.vote.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      options: { include: { _count: { select: { submissions: true } } } },
      _count: { select: { submissions: true } },
    },
  })
}

export interface IssueFilter {
  role?: Role
  seriousness?: IssueLevel
  urgency?: IssueLevel
  status?: IssueStatus
  page?: number
  pageSize?: number
}

export async function getIssues(filters: IssueFilter = {}) {
  const { role, seriousness, urgency, status, page = 1, pageSize = 30 } = filters
  const skip = (page - 1) * pageSize

  const where = {
    ...(seriousness ? { seriousness } : {}),
    ...(urgency ? { urgency } : {}),
    ...(status ? { status } : {}),
    ...(role ? { reporter: { role } } : {}),
  }

  const [issues, total] = await Promise.all([
    db.issue.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { fullName: true, memberId: true, role: true } },
        assignee: { select: { fullName: true } },
        _count: { select: { replies: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, authorId: true, message: true, createdAt: true },
        },
      },
    }),
    db.issue.count({ where }),
  ])

  return { issues, total }
}

export async function getNotifications(userId: string, limit = 50) {
  return db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

export async function getUserVoteSubmission(voteId: string, userId: string) {
  return db.voteSubmission.findUnique({
    where: { voteId_userId: { voteId, userId } },
  })
}

export async function getUpdatesWithAcknowledgements(
  userId: string,
  userRole: Role,
  groupIds: string[] = [],
  page = 1,
  pageSize = 20,
) {
  const skip = (page - 1) * pageSize

  // Admins see everything; other roles get filtered by targetType
  const isAdmin = userRole === 'MASTER_ADMIN' || userRole === 'ADMIN'
  const where = isAdmin
    ? {}
    : {
        OR: [
          { targetType: AnnouncementTargetType.COMMUNITY_WIDE },
          { targetType: AnnouncementTargetType.ROLE, targetRole: userRole },
          ...(groupIds.length > 0
            ? [
                {
                  targetType: AnnouncementTargetType.VISITOR_GROUP,
                  targetGroupId: { in: groupIds },
                },
              ]
            : []),
          { targetType: AnnouncementTargetType.SPECIFIC_USERS, targetUserIds: { has: userId } },
        ],
      }

  const [updates, total] = await Promise.all([
    db.communityUpdate.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { publishedAt: 'desc' },
      include: {
        acknowledgements: {
          where: { userId },
          select: { id: true },
        },
      },
    }),
    db.communityUpdate.count({ where }),
  ])
  return { updates, total }
}

export async function getVotesWithUserSubmissions(userId: string) {
  return db.vote.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      options: {
        include: { _count: { select: { submissions: true } } },
      },
      _count: { select: { submissions: true } },
      submissions: {
        where: { userId },
        select: { optionId: true },
      },
    },
  })
}

export async function getIssueDetail(issueId: string) {
  return db.issue.findUnique({
    where: { id: issueId },
    include: {
      reporter: {
        select: { id: true, fullName: true, memberId: true, role: true, profilePhotoUrl: true },
      },
      assignee: {
        select: { id: true, fullName: true },
      },
      replies: {
        orderBy: { createdAt: 'asc' },
        include: {
          issue: { select: { reporterId: true } },
        },
      },
    },
  })
}
