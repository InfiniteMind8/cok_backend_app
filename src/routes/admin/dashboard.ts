import { Hono } from 'hono'
import type { AppEnv } from '../../server.js'
import {
  getActiveMemberCount,
  getCommunityFundBalance,
  getCreditsByRole,
  getOpenIssueCount,
  getPendingApprovalCount,
  getSystemWalletSummary,
  getTotalCirculatingCredits,
  getTreasuryFlowByRole,
  getTreasuryReserveBalance,
} from '../../lib/queries/dashboard.js'

export const dashboardRoute = new Hono<AppEnv>()

// ─── GET / — full admin dashboard payload ────────────────────────────────────
// Single aggregate fetch so the dashboard renders in one round-trip. The lib
// queries are read-only; concurrent execution is safe.
dashboardRoute.get('/', async (c) => {
  const [
    treasuryReserve,
    communityFund,
    systemWallets,
    totalCirculating,
    activeMembers,
    pendingApprovals,
    openIssues,
    flowByRole,
    creditsByRole,
  ] = await Promise.all([
    getTreasuryReserveBalance(),
    getCommunityFundBalance(),
    getSystemWalletSummary(),
    getTotalCirculatingCredits(),
    getActiveMemberCount(),
    getPendingApprovalCount(),
    getOpenIssueCount(),
    getTreasuryFlowByRole(),
    getCreditsByRole(),
  ])

  return c.json({
    ok: true,
    data: {
      treasuryReserve: treasuryReserve.toString(),
      communityFund: communityFund.toString(),
      systemWallets: systemWallets.map((w) => ({
        walletId: w.walletId,
        key: w.key,
        balance: w.balance.toString(),
        floor: w.floor?.toString() ?? null,
        headroom: w.headroom?.toString() ?? null,
      })),
      totalCirculating: totalCirculating.toString(),
      activeMembers,
      pendingApprovals,
      openIssues,
      flowByRole: flowByRole.map((r) => ({
        role: r.role,
        totalDeposits: r.totalDeposits.toString(),
        totalSettlements: r.totalSettlements.toString(),
      })),
      creditsByRole: creditsByRole.map((r) => ({
        role: r.role,
        totalBalance: r.totalBalance.toString(),
        memberCount: r.memberCount,
      })),
    },
  })
})
