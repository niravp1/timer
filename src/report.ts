import { Temporal } from '@js-temporal/polyfill'
import { localDay, localInstant } from './time'
import type { Tracker } from './engine'

export const weekOf = (at: number, zone: string) => {
  const day = localDay(at, zone)
  return day.subtract({ days: day.dayOfWeek - 1 })
}

export function report(state: Tracker, day: Temporal.PlainDate, now: number) {
  const { zone } = state.settings
  const from = localInstant(day, zone)
  const to = localInstant(day.add({ days: 1 }), zone)
  const overlap = (start: number, end: number) => Math.max(0, Math.min(to, end) - Math.max(from, start))
  const totals = { focus: 0, rest: 0, included: 0, pauses: 0, overage: 0, away: 0 }
  const entries = state.blocks.flatMap(block => {
    const until = Math.min(now, block.cutoff)
    return block.cycles.flatMap(cycle => {
      const end = cycle.rest ? cycle.rest.end ?? until : cycle.end ?? until
      if (cycle.start >= to || (end <= from && cycle.start < from)) return []

      const elapsed = { focus: 0, rest: 0, included: 0, pauses: 0, overage: 0, away: 0 }
      for (const interval of cycle.intervals) {
        const ms = overlap(interval.start, interval.end ?? until)
        if (interval.kind === 'focus') elapsed.focus += ms
        if (interval.kind === 'manual_pause') elapsed.pauses += ms
        if (interval.kind === 'system_interruption') elapsed.away += ms
      }
      if (cycle.rest) {
        const { start, end, allowance } = cycle.rest
        elapsed.rest = overlap(start, end ?? until)
        elapsed.included = overlap(start, Math.min(start + allowance, end ?? until))
        elapsed.overage = overlap(start + allowance, end ?? until)
      }
      for (const kind of Object.keys(totals) as (keyof typeof totals)[]) totals[kind] += elapsed[kind]
      return [{ cycle, ...elapsed }]
    })
  })
  const extra = totals.pauses + totals.overage
  return { ...totals, extra, recorded: totals.focus + totals.included + extra + totals.away, entries }
}
