// Demo accounts — copied verbatim from website/lib/demo-mode.ts. Backend uses
// these to mint short-lived Clerk sign-in tokens during the auth/token flow
// and to gate demo-only routes.
export type DemoAccount = {
  id: string
  name: string
  role: 'MASTER_ADMIN' | 'ADMIN' | 'RESIDENT' | 'VENDOR' | 'VISITOR'
  title: string
  description: string
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: 'user_3CtmfDZfRg9T21vmoAEMqwKj5co',
    name: 'Karis Munroe',
    role: 'MASTER_ADMIN',
    title: 'Master Admin',
    description: 'Full platform access - treasury, accounts, settings',
  },
  {
    id: 'user_3CtmfI4l73YuvWDzzAT1H9I3g91',
    name: 'Naomi Wells',
    role: 'ADMIN',
    title: 'Admin',
    description: 'Approvals, community management, member support',
  },
  {
    id: 'user_3CtmfMWnpFibGSGws37JEW7FFwH',
    name: 'Devon McKenzie',
    role: 'RESIDENT',
    title: 'Resident',
    description: 'Wallet, property, community - full resident experience',
  },
  {
    id: 'user_3CtmfKH80kXydPxKBsxVjFfgZLP',
    name: 'Anjali Pereira',
    role: 'RESIDENT',
    title: 'Resident',
    description: 'Pending settlement request, active community member',
  },
  {
    id: 'user_3CtmfWRMtnrt8gecUHkqyQ0CMZk',
    name: 'Aaliyah Singh',
    role: 'VENDOR',
    title: 'Vendor',
    description: 'Vendor wallet access - Phase 2 portal coming soon',
  },
  {
    id: 'user_3CtmfSIS8UizzHXbLQQfbyC5o5w',
    name: 'Marcus Bowen',
    role: 'VISITOR',
    title: 'Visitor',
    description: 'Limited access - wallet only, no property tab',
  },
]

export function getDemoAccount(userId: string): DemoAccount | null {
  const account = DEMO_ACCOUNTS.find((demoAccount) => demoAccount.id === userId)
  return account ? { ...account } : null
}

export function listDemoAccounts(): DemoAccount[] {
  return DEMO_ACCOUNTS.map((account) => ({ ...account }))
}
