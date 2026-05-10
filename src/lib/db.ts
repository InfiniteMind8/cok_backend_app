// Re-export the Prisma client under the name `db` to match the website's
// historical convention. Keeps the diff for ported lib/* and routes/* small.
export { prisma as db } from './prisma.js'
