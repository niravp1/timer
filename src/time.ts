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

const padTime = (value: number) => String(value).padStart(2, '0')

export function clockText(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return [Math.floor(seconds / 60), seconds % 60].map(padTime).join(':')
}

export function durationClockText(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(padTime).join(':')
}

export function breakClockText(ms: number) {
  const clock = durationClockText(ms)
  return clock.startsWith('00:') ? clock.slice(3) : clock
}

export function duration(ms: number) {
  const mins = Math.floor(ms / minute)
  if (mins === 0 && ms > 0) return `${Math.floor(ms / 1000)}s`
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export function preciseDuration(ms: number) {
  if (ms < minute) return duration(ms)
  const seconds = Math.floor(ms / 1000) % 60
  return seconds ? `${duration(ms)} ${seconds}s` : duration(ms)
}
