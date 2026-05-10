import { db } from './db.js'

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generate(): string {
  let result = 'K-'
  for (let i = 0; i < 6; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS.length)]
  }
  return result
}

export async function generateUniqueMemberId(): Promise<string> {
  let memberId = generate()
  let attempts = 0
  while (attempts < 10) {
    const existing = await db.user.findUnique({ where: { memberId } })
    if (!existing) return memberId
    memberId = generate()
    attempts++
  }
  throw new Error('Failed to generate unique member ID after 10 attempts')
}
