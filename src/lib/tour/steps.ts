import type { Role } from '@prisma/client'

export interface TourStep {
  id: string
  target: string
  title: string
  body: string
}

const MASTER_ADMIN_STEPS: TourStep[] = [
  { id: 'ma-1', target: 'tour-dashboard',     title: 'Your command center',         body: 'This dashboard gives you a live summary of the city — open transactions, pending approvals, and recent activity.' },
  { id: 'ma-2', target: 'tour-treasury',      title: 'Treasury',                    body: 'Monitor all ledger activity, reconciliation reports, and wallet balances from here.' },
  { id: 'ma-3', target: 'tour-approvals',     title: 'Approvals',                   body: 'Review and action property transfers, settlements, and voucher requests that need your sign-off.' },
  { id: 'ma-4', target: 'tour-accounts',      title: 'Accounts & data directory',   body: 'Browse and manage every member in the city. Individual records, attachments, and the data directory are all accessible here.' },
  { id: 'ma-5', target: 'tour-audit-log',     title: 'Audit log',                   body: 'Every admin action is recorded here. Use it to review the history of any change made to the system.' },
  { id: 'ma-6', target: 'tour-settings',      title: 'Settings',                    body: 'Configure exchange rates, fee schedules, and promotions. Changes you make here affect every transaction in the city.' },
  { id: 'ma-7', target: 'tour-community',     title: 'Community & broadcast',       body: 'Publish announcements and send emergency broadcasts to all residents from this section.' },
  { id: 'ma-8', target: 'tour-account-menu',  title: 'Your account',                body: 'Sign out, replay this tour, or update your profile at any time from here.' },
]

const ADMIN_STEPS: TourStep[] = [
  { id: 'ad-1', target: 'tour-dashboard',     title: 'Your dashboard',  body: 'This is your overview of the city — recent activity and key metrics at a glance.' },
  { id: 'ad-2', target: 'tour-approvals',     title: 'Approvals',       body: 'Incoming requests from residents and vendors appear here for your review.' },
  { id: 'ad-3', target: 'tour-accounts',      title: 'Residents',       body: 'Browse resident profiles, documents, and account history from this section.' },
  { id: 'ad-4', target: 'tour-audit-log',     title: 'Audit log',       body: 'A full record of all admin actions taken in the system.' },
  { id: 'ad-5', target: 'tour-account-menu',  title: 'Your account',    body: 'Sign out or replay this tour from here at any time.' },
]

const RESIDENT_STEPS: TourStep[] = [
  { id: 're-1', target: 'tour-wallet-tab',    title: 'Your wallet',          body: 'Your KCRD balance and full transaction history are always one tap away.' },
  { id: 're-2', target: 'tour-tenancy-tab',   title: 'Your tenancy',         body: 'View your property details, lease terms, and upcoming payment schedule here.' },
  { id: 're-3', target: 'tour-community-tab', title: 'Community',            body: 'City-wide announcements, issue reports, and community updates in one place.' },
  { id: 're-4', target: 'tour-profile-tab',   title: 'Your profile',         body: 'Update your display currency, two-factor authentication, and personal details.' },
  { id: 're-5', target: 'tour-profile-tab',   title: 'Account & sign out',   body: 'Return to your profile tab at any time to manage your settings or sign out of the city.' },
]

const VENDOR_STEPS: TourStep[] = [
  { id: 've-1', target: 'tour-vendor-dashboard', title: 'Your dashboard',    body: 'Track your activity and city relationship at a glance.' },
  { id: 've-2', target: 'tour-vendor-payments',  title: 'Sales & payments',  body: 'Review your transaction history and incoming payments here.' },
  { id: 've-3', target: 'tour-profile-tab',      title: 'Your profile',      body: 'Keep your business profile and contact details current.' },
  { id: 've-4', target: 'tour-profile-tab',      title: 'Your account',      body: 'Manage your settings and sign out from your profile at any time.' },
]

const VISITOR_STEPS: TourStep[] = [
  { id: 'vi-1', target: 'tour-community-tab', title: 'Your visit',         body: 'City-wide announcements and updates relevant to your stay appear here.' },
  { id: 'vi-2', target: 'tour-community-tab', title: 'Announcements',      body: 'Stay informed about any city activity, maintenance, or events during your visit.' },
  { id: 'vi-3', target: 'tour-community-tab', title: 'Report an issue',    body: 'If something needs attention, file an issue report from the Community tab.' },
  { id: 'vi-4', target: 'tour-profile-tab',   title: 'Your account',       body: 'Review your visitor details, contact your host, and manage your settings from here.' },
]

export function getTourSteps(role: Role): TourStep[] {
  switch (role) {
    case 'MASTER_ADMIN':
      return MASTER_ADMIN_STEPS
    case 'ADMIN':
      return ADMIN_STEPS
    case 'RESIDENT':
      return RESIDENT_STEPS
    case 'VENDOR':
      return VENDOR_STEPS
    case 'VISITOR':
      return VISITOR_STEPS
    default:
      return []
  }
}
