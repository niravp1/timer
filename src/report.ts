import { Temporal } from '@js-temporal/polyfill'
import { localDay, localInstant } from './time'
import type { Tracker } from './engine'

export const weekOf = (at: number, zone: string) => {
  const day = localDay(at, zone)
  return day.subtract({ days: day.dayOfWeek - 1 })
}

const allowanceCache = new WeakMap<Tracker['blocks'], { zone: string; allocations: Map<string, number> }>()

export function breakAllowances({ blocks, settings: { zone } }: Tracker) {
  const cached = allowanceCache.get(blocks)
  if (cached?.zone === zone) return cached.allocations

  const available = new Map<string, number>()
  const allocations = new Map<string, number>()
  const useBreak = (period: { id: string; start: number; end?: number }, earned = 0) => {
    const day = localDay(period.start, zone).toString()
    const allowance = (available.get(day) ?? 0) + earned
    allocations.set(period.id, allowance)
    available.set(day, Math.max(0, allowance - ((period.end ?? period.start) - period.start)))
  }

  for (const block of blocks) {
    available.clear()
    for (const cycle of block.cycles) {
      for (const interval of cycle.intervals) {
        if (interval.kind !== 'focus') useBreak(interval)
      }
      if (cycle.rest) useBreak(cycle.rest, cycle.rest.allowance)
    }
  }
  allowanceCache.set(blocks, { zone, allocations })
  return allocations
}

export function report(state: Tracker, day: Temporal.PlainDate, now: number) {
  const { zone } = state.settings
  const from = localInstant(day, zone)
  const to = localInstant(day.add({ days: 1 }), zone)
  const overlap = (start: number, end: number) => Math.max(0, Math.min(to, end) - Math.max(from, start))
  const allocations = breakAllowances(state)
  const totals = { focus: 0, rest: 0, included: 0, pauses: 0, pauseIncluded: 0, overage: 0, away: 0, awayIncluded: 0 }
  const entries = state.blocks.flatMap(block => {
    const until = Math.min(now, block.cutoff)
    return block.cycles.flatMap(cycle => {
      const end = cycle.rest ? cycle.rest.end ?? until : cycle.end ?? until
      if (cycle.start >= to || (end <= from && cycle.start < from)) return []

      const elapsed = { focus: 0, rest: 0, included: 0, pauses: 0, pauseIncluded: 0, overage: 0, away: 0, awayIncluded: 0 }
      for (const interval of cycle.intervals) {
        const ms = overlap(interval.start, interval.end ?? until)
        if (interval.kind === 'focus') elapsed.focus += ms
        if (interval.kind !== 'focus') {
          const included = overlap(interval.start, Math.min(interval.end ?? until,
            interval.start + (allocations.get(interval.id) ?? 0)))
          if (interval.kind === 'manual_pause') {
            elapsed.pauses += ms
            elapsed.pauseIncluded += included
          } else {
            elapsed.away += ms
            elapsed.awayIncluded += included
          }
        }
      }
      if (cycle.rest) {
        const { start, end, id } = cycle.rest
        const allowance = allocations.get(id) ?? 0
        elapsed.rest = overlap(start, end ?? until)
        elapsed.included = overlap(start, Math.min(start + allowance, end ?? until))
        elapsed.overage = overlap(start + allowance, end ?? until)
      }
      elapsed.included += elapsed.pauseIncluded + elapsed.awayIncluded
      for (const kind of Object.keys(totals) as (keyof typeof totals)[]) totals[kind] += elapsed[kind]
      return [{ cycle, ...elapsed }]
    })
  })
  const extra = totals.pauses - totals.pauseIncluded + totals.away - totals.awayIncluded + totals.overage
  return { ...totals, extra, tracked: totals.focus + totals.included + extra, entries }
}
