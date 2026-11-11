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
  const totals = { focus: 0, rest: 0, included: 0, pauses: 0, overage: 0 }
  const entries = state.blocks.flatMap(block => {
    const until = Math.min(now, block.cutoff)
    return block.cycles.filter(cycle => {
      for (const interval of cycle.intervals) {
        const ms = overlap(interval.start, interval.end ?? until)
        if (interval.kind === 'focus') totals.focus += ms
        if (interval.kind === 'manual_pause') totals.pauses += ms
      }
      if (cycle.rest) {
        const { start, end, allowance } = cycle.rest
        totals.rest += overlap(start, end ?? until)
        totals.included += overlap(start, Math.min(start + allowance, end ?? until))
        totals.overage += overlap(start + allowance, end ?? until)
      }
      const end = cycle.rest ? cycle.rest.end ?? until : cycle.end ?? until
      return cycle.start < to && (end > from || cycle.start >= from)
    })
  })
  return { ...totals, extra: totals.pauses + totals.overage, entries }
}
