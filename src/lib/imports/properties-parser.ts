import * as XLSX from 'xlsx'
import { z } from 'zod'

export type ParsedRowStatus = 'VALID' | 'WARNING' | 'ERROR'

export interface ParsedPropertyRow {
  rowNumber: number
  rowData: PropertyRowData
  status: ParsedRowStatus
  messages: string[]
}

export interface PropertyRowData {
  external_ref: string
  address_line_1: string
  address_line_2: string
  lot_number: string
  type: string
  size_sqm: string
  bedrooms: string
  bathrooms: string
  parking_spots: string
  year_built: string
  status: string
  purchase_price_kcrd: string
  current_valuation_kcrd: string
  notes: string
}

const PROPERTY_TYPE_VALUES = ['OWNERSHIP', 'RENTAL', 'ADMIN'] as const
const PROPERTY_STATUS_VALUES = ['VACANT', 'OCCUPIED', 'UNDER_CONSTRUCTION'] as const
const CURRENT_YEAR = new Date().getFullYear()

function normalizeString(val: unknown): string {
  if (val === null || val === undefined) return ''
  return String(val).trim()
}

function normalizePositiveDecimal(val: unknown): { value: string; error: string | null } {
  const s = normalizeString(val)
  if (s === '') return { value: '', error: null }
  const n = parseFloat(s)
  if (isNaN(n)) return { value: '', error: `"${s}" is not a valid number` }
  if (n < 0) return { value: '', error: `"${s}" must be 0 or greater` }
  return { value: String(n), error: null }
}

function normalizeNonNegativeInt(
  val: unknown,
  fieldName: string,
): { value: string; error: string | null; warning: string | null } {
  const s = normalizeString(val)
  if (s === '') return { value: '', error: null, warning: null }
  const n = parseFloat(s)
  if (isNaN(n))
    return { value: '', error: `${fieldName} "${s}" is not a valid number`, warning: null }
  if (n < 0) return { value: '', error: `${fieldName} must be 0 or greater`, warning: null }
  const rounded = Math.floor(n)
  const warning = rounded !== n ? `${fieldName} "${s}" was rounded to ${rounded}` : null
  return { value: String(rounded), error: null, warning }
}

function normalizeYearBuilt(val: unknown): { value: string; error: string | null } {
  const s = normalizeString(val)
  if (s === '') return { value: '', error: null }
  const n = parseInt(s, 10)
  if (isNaN(n)) return { value: '', error: `year_built "${s}" is not a valid year` }
  if (n < 1800 || n > CURRENT_YEAR) {
    return { value: '', error: `year_built "${n}" must be between 1800 and ${CURRENT_YEAR}` }
  }
  return { value: String(n), error: null }
}

const PropertyRowSchema = z.object({
  address_line_1: z.string().min(1, 'address_line_1 is required'),
  type: z.enum(PROPERTY_TYPE_VALUES, {
    error: `type must be one of: ${PROPERTY_TYPE_VALUES.join(', ')}`,
  }),
})

export async function parsePropertiesSheet(
  buffer: ArrayBuffer,
  existingCodes: Set<string>,
): Promise<ParsedPropertyRow[]> {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return []

  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    raw: true,
  })

  const results: ParsedPropertyRow[] = []
  const seenExternalRefs = new Set<string>()

  for (let i = 0; i < raw.length; i++) {
    const rawRow = raw[i] ?? {}
    const rowNumber = i + 2
    const messages: string[] = []
    let status: ParsedRowStatus = 'VALID'

    const typeRaw = normalizeString(rawRow['type']).toUpperCase()
    const statusRaw = normalizeString(rawRow['status']).toUpperCase() || 'VACANT'

    const rowData: PropertyRowData = {
      external_ref: normalizeString(rawRow['external_ref']),
      address_line_1: normalizeString(rawRow['address_line_1']),
      address_line_2: normalizeString(rawRow['address_line_2']),
      lot_number: normalizeString(rawRow['lot_number']),
      type: typeRaw,
      size_sqm: '',
      bedrooms: '',
      bathrooms: '',
      parking_spots: '',
      year_built: '',
      status: statusRaw,
      purchase_price_kcrd: '',
      current_valuation_kcrd: '',
      notes: normalizeString(rawRow['notes']),
    }

    const zodResult = PropertyRowSchema.safeParse({
      address_line_1: rowData.address_line_1,
      type: rowData.type,
    })
    if (!zodResult.success) {
      status = 'ERROR'
      for (const issue of zodResult.error.issues) {
        messages.push(issue.message)
      }
    }

    if (
      rowData.status &&
      !PROPERTY_STATUS_VALUES.includes(rowData.status as (typeof PROPERTY_STATUS_VALUES)[number])
    ) {
      status = 'ERROR'
      messages.push(`status "${rowData.status}" must be one of: ${PROPERTY_STATUS_VALUES.join(', ')}`)
      rowData.status = 'VACANT'
    }

    const sizeResult = normalizePositiveDecimal(rawRow['size_sqm'])
    if (sizeResult.error) {
      status = 'ERROR'
      messages.push(`size_sqm ${sizeResult.error}`)
    } else {
      rowData.size_sqm = sizeResult.value
    }

    const bedroomsResult = normalizeNonNegativeInt(rawRow['bedrooms'], 'bedrooms')
    if (bedroomsResult.error) {
      status = 'ERROR'
      messages.push(bedroomsResult.error)
    } else {
      rowData.bedrooms = bedroomsResult.value
      if (bedroomsResult.warning) {
        if (status === 'VALID') status = 'WARNING'
        messages.push(bedroomsResult.warning)
      }
    }

    const bathroomsResult = normalizeNonNegativeInt(rawRow['bathrooms'], 'bathrooms')
    if (bathroomsResult.error) {
      status = 'ERROR'
      messages.push(bathroomsResult.error)
    } else {
      rowData.bathrooms = bathroomsResult.value
      if (bathroomsResult.warning) {
        if (status === 'VALID') status = 'WARNING'
        messages.push(bathroomsResult.warning)
      }
    }

    const parkingResult = normalizeNonNegativeInt(rawRow['parking_spots'], 'parking_spots')
    if (parkingResult.error) {
      status = 'ERROR'
      messages.push(parkingResult.error)
    } else {
      rowData.parking_spots = parkingResult.value
      if (parkingResult.warning) {
        if (status === 'VALID') status = 'WARNING'
        messages.push(parkingResult.warning)
      }
    }

    const yearResult = normalizeYearBuilt(rawRow['year_built'])
    if (yearResult.error) {
      status = 'ERROR'
      messages.push(yearResult.error)
    } else {
      rowData.year_built = yearResult.value
    }

    const purchaseResult = normalizePositiveDecimal(rawRow['purchase_price_kcrd'])
    if (purchaseResult.error) {
      status = 'ERROR'
      messages.push(`purchase_price_kcrd ${purchaseResult.error}`)
    } else {
      rowData.purchase_price_kcrd = purchaseResult.value
    }

    const valuationResult = normalizePositiveDecimal(rawRow['current_valuation_kcrd'])
    if (valuationResult.error) {
      status = 'ERROR'
      messages.push(`current_valuation_kcrd ${valuationResult.error}`)
    } else {
      rowData.current_valuation_kcrd = valuationResult.value
    }

    if (rowData.external_ref) {
      if (seenExternalRefs.has(rowData.external_ref)) {
        if (status === 'VALID') status = 'WARNING'
        messages.push(
          `external_ref "${rowData.external_ref}" appears more than once in this file — duplicate row.`,
        )
      } else {
        seenExternalRefs.add(rowData.external_ref)
      }
    }

    const code = rowData.external_ref || `IMP-${String(rowNumber - 1).padStart(4, '0')}`
    if (existingCodes.has(code)) {
      if (status === 'VALID') status = 'WARNING'
      messages.push(
        `Property code "${code}" already exists — this will create a duplicate. Confirm to proceed.`,
      )
    }

    results.push({ rowNumber, rowData, status, messages })
  }

  return results
}
