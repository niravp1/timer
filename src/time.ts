import { Temporal } from '@js-temporal/polyfill'

export const minute = 60_000

export function localDay(at: number, zone: string) {
  return Temporal.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(zone).toPlainDate()
}

export function localInstant(day: Temporal.PlainDate, zone: string, time = '00:00') {
  return day.toZonedDateTime({ timeZone: zone, plainTime: time }).epochMilliseconds
}

export function cutoff(at: number, zone: string, time: string) {
  return localInstant(localDay(at, zone), zone, time)
}

export function clockText(ms: number, up = false) {
  const seconds = Math.max(0, up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000))
  return [Math.floor(seconds / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':')
}

export function duration(ms: number) {
  const mins = Math.floor(ms / minute)
  if (mins === 0 && ms > 0) return `${Math.floor(ms / 1000)}s`
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
}
