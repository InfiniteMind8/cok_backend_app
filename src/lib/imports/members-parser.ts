import * as XLSX from 'xlsx'
import { z } from 'zod'

export type ParsedRowStatus = 'VALID' | 'WARNING' | 'ERROR'

export interface ParsedRow {
  rowNumber: number
  rowData: MemberRowData
  status: ParsedRowStatus
  messages: string[]
}

export interface MemberRowData {
  full_name: string
  preferred_name: string
  dob: string
  gender: string
  email: string
  phone_e164: string
  national_id_type: string
  national_id_number: string
  emergency_contact_name: string
  emergency_contact_phone: string
  household_size: string
  vehicle_plates: string
  notes: string
}

const GENDER_VALUES = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'] as const

function normalizeString(val: unknown): string {
  if (val === null || val === undefined) return ''
  return String(val).trim()
}

// Normalize a date string to ISO YYYY-MM-DD.
// Accepts: YYYY-MM-DD, MM/DD/YYYY, DD-MM-YYYY, Excel serial numbers.
export function normalizeDate(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null

  if (typeof val === 'number') {
    try {
      const date = XLSX.SSF.parse_date_code(val)
      if (date) {
        const y = date.y
        const m = String(date.m).padStart(2, '0')
        const d = String(date.d).padStart(2, '0')
        return `${y}-${m}-${d}`
      }
    } catch {
      return null
    }
  }

  const s = String(val).trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T00:00:00Z')
    if (!isNaN(d.getTime())) return s
    return null
  }

  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) {
    const [, m, d, y] = mdy
    if (!m || !d || !y) return null
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    const dt = new Date(iso + 'T00:00:00Z')
    if (!isNaN(dt.getTime())) return iso
    return null
  }

  const dmy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dmy) {
    const [, d, m, y] = dmy
    if (!m || !d || !y) return null
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    const dt = new Date(iso + 'T00:00:00Z')
    if (!isNaN(dt.getTime())) return iso
    return null
  }

  return null
}

// Normalize phone to E.164 or return null.
export function normalizePhone(val: unknown): { phone: string; isWarning: boolean } | null {
  if (val === null || val === undefined || val === '') return null

  const s = String(val).trim().replace(/[\s\-().]/g, '')

  if (/^\+[1-9]\d{6,14}$/.test(s)) {
    return { phone: s, isWarning: false }
  }

  if (/^\d{10}$/.test(s)) {
    return { phone: `+1${s}`, isWarning: true }
  }

  if (/^1\d{10}$/.test(s)) {
    return { phone: `+${s}`, isWarning: false }
  }

  return null
}

const MemberRowSchema = z.object({
  full_name: z.string().min(1, 'full_name is required'),
  email: z.string().email('Invalid email address'),
  gender: z.enum(GENDER_VALUES, {
    error: `gender must be one of: ${GENDER_VALUES.join(', ')}`,
  }),
})

export async function parseMembersSheet(
  buffer: ArrayBuffer,
  existingEmails: Set<string>,
): Promise<ParsedRow[]> {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return []

  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    raw: true,
  })

  const results: ParsedRow[] = []

  for (let i = 0; i < raw.length; i++) {
    const rawRow = raw[i] ?? {}
    const rowNumber = i + 2
    const messages: string[] = []
    let status: ParsedRowStatus = 'VALID'

    const rowData: MemberRowData = {
      full_name: normalizeString(rawRow['full_name']),
      preferred_name: normalizeString(rawRow['preferred_name']),
      dob: '',
      gender: normalizeString(rawRow['gender']).toUpperCase(),
      email: normalizeString(rawRow['email']).toLowerCase(),
      phone_e164: '',
      national_id_type: normalizeString(rawRow['national_id_type']),
      national_id_number: normalizeString(rawRow['national_id_number']),
      emergency_contact_name: normalizeString(rawRow['emergency_contact_name']),
      emergency_contact_phone: normalizeString(rawRow['emergency_contact_phone']),
      household_size: normalizeString(rawRow['household_size']),
      vehicle_plates: normalizeString(rawRow['vehicle_plates']),
      notes: normalizeString(rawRow['notes']),
    }

    const zodResult = MemberRowSchema.safeParse(rowData)
    if (!zodResult.success) {
      status = 'ERROR'
      for (const issue of zodResult.error.issues) {
        messages.push(issue.message)
      }
    }

    const normalizedDob = normalizeDate(rawRow['dob'])
    if (!normalizedDob) {
      if (normalizeString(rawRow['dob'])) {
        status = 'ERROR'
        messages.push(
          `dob "${normalizeString(rawRow['dob'])}" is not a recognized date format (use YYYY-MM-DD, MM/DD/YYYY, or DD-MM-YYYY)`,
        )
      }
    } else {
      rowData.dob = normalizedDob
    }

    const phoneRaw = rawRow['phone_e164']
    const phoneResult = normalizePhone(phoneRaw)
    if (phoneRaw !== '' && phoneRaw !== null && phoneRaw !== undefined) {
      if (!phoneResult) {
        status = 'ERROR'
        messages.push(
          `phone_e164 "${normalizeString(phoneRaw)}" is not a valid phone number (use E.164 format, e.g. +1 868 555 0100)`,
        )
      } else {
        rowData.phone_e164 = phoneResult.phone
        if (phoneResult.isWarning && status === 'VALID') {
          status = 'WARNING'
          messages.push(
            `Phone number "${normalizeString(phoneRaw)}" had no country code — assumed +1 (Trinidad/Tobago or US). Verify before committing.`,
          )
        }
      }
    }

    if (rowData.email && existingEmails.has(rowData.email)) {
      if (status === 'VALID') status = 'WARNING'
      messages.push(
        `Email "${rowData.email}" already exists — this will create a duplicate account. Confirm to proceed.`,
      )
    }

    results.push({ rowNumber, rowData, status, messages })
  }

  return results
}
