import ticketsMd from '../../../kit/02_tickets.md?raw'
import solutionsSql from '../../../kit/03_solutions.sql?raw'
import memoMd from '../../../kit/04_memo_postgres_n2.md?raw'

export type KitTicket = { id: string; title: string; level: string; body: string; solution: string }

function parseSolutions(): Record<string, string> {
  const out: Record<string, string> = {}
  const parts = solutionsSql.split(/^\\echo '===== (T\d\d) · .*$/m)
  for (let i = 1; i < parts.length; i += 2) out[parts[i]] = parts[i + 1].trim()
  return out
}

function parseTickets(): KitTicket[] {
  const solutions = parseSolutions()
  const tickets: KitTicket[] = []
  let level = ''
  for (const block of ticketsMd.split(/^(?=## |### )/m)) {
    const lvl = block.match(/^## (.+)/)
    if (lvl) {
      level = lvl[1].trim()
      continue
    }
    const t = block.match(/^### (T\d\d) · « (.+?) »\s*\n([\s\S]*)/)
    if (t) tickets.push({ id: t[1], title: t[2], level, body: t[3].replace(/\n---\s*$/, '').trim(), solution: solutions[t[1]] ?? '' })
  }
  return tickets
}

export const kitTickets = parseTickets()
export const ticketRules = ticketsMd.split(/^---$/m)[0].replace(/^# .*\n/, '').trim()
export { memoMd }
