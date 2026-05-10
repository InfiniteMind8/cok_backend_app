import { runAndSaveReconciliation } from '../lib/ledger/reconciliation-report.js'

export interface ReconciliationCronResult {
  ok: true
  status: 'OK' | 'MISMATCH' | 'WARNING'
  reportId: string
  discrepancy: string
}

export async function runReconciliationCron(): Promise<ReconciliationCronResult> {
  const report = await runAndSaveReconciliation()
  return {
    ok: true,
    status: report.status,
    reportId: report.id,
    discrepancy: report.details.discrepancy,
  }
}
