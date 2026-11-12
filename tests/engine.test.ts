import { describe, expect, it } from 'vitest'
import { current, defaults, initial, recover, span, total, transition, type Action, type Tracker } from '../src/engine'
import { report, weekOf } from '../src/report'
import { cutoff, localDay, localInstant, minute } from '../src/time'

const zone = 'America/New_York'
const at = (time: string, date = '2026-11-09') => Date.parse(`${date}T${time}:00-05:00`)
const empty = () => initial(defaults(zone))
const step = (state: Tracker, type: Exclude<Action['type'], 'settings_changed'>, time: string) =>
  transition(state, { type, at: at(time), id: crypto.randomUUID() })
const activity = (state: Tracker) => state.blocks.at(-1)!.cycles.at(-1)!
const sum = (state: Tracker, time = '20:30') => report(state, localDay(at(time), zone), at(time))

describe('focus and break accounting', () => {
  it('T1 records exact focus, manual pause, wall span, and overage', () => {
    let state = step(empty(), 'start', '11:00')
    state = step(state, 'pause', '11:30')
    state = step(state, 'resume', '12:04')
    state = step(state, 'tick', '12:36')
    const cycle = activity(state)
    expect(cycle.end).toBe(at('12:34'))
    expect(cycle.rest?.start).toBe(at('12:34'))
    expect(span(cycle, at('12:36'))).toBe(94 * minute)
    expect(total(cycle, 'focus', at('12:36'))).toBe(60 * minute)
    expect(total(cycle, 'manual_pause', at('12:36'))).toBe(34 * minute)
    state = step(state, 'start', '12:57')
    expect(state.blocks).toHaveLength(1)
    expect(state.blocks[0].cycles[0].rest?.end).toBe(at('12:57'))
    expect(activity(state).start).toBe(at('12:57'))
    expect(sum(state, '12:57')).toMatchObject({ rest: 23 * minute, included: 15 * minute, overage: 8 * minute, pauses: 34 * minute, extra: 42 * minute })
  })

  it('T2 chips away at one target', () => {
    let state = step(empty(), 'start', '10:00')
    for (const [type, time] of [
      ['pause', '10:05'], ['resume', '10:15'], ['pause', '10:20'], ['resume', '10:25'], ['tick', '11:15'],
    ] as const) state = step(state, type, time)
    expect(activity(state)).toMatchObject({ start: at('10:00'), end: at('11:15'), status: 'completed' })
    expect(sum(state, '11:15')).toMatchObject({ focus: 60 * minute, pauses: 15 * minute })
  })

  it('adds each earned allowance to the unused same-day balance', () => {
    let state = step(empty(), 'start', '10:00')
    state = step(state, 'start', '11:12')
    state = step(state, 'end_session', '12:35')
    expect(sum(state)).toMatchObject({ rest: 35 * minute, included: 30 * minute, overage: 5 * minute })
  })

  it('uses the unused 12 minutes for a manual pause and charges only the excess', () => {
    let state = step(empty(), 'start', '09:00')
    state = step(state, 'start', '10:03')
    state = step(state, 'pause', '10:13')
    expect(sum(state, '10:18')).toMatchObject({ focus: 70 * minute, included: 8 * minute, extra: 0 })
    state = step(state, 'resume', '10:28')
    expect(sum(state, '10:28')).toMatchObject({
      focus: 70 * minute, included: 15 * minute, extra: 3 * minute,
      entries: [{ rest: 3 * minute }, { pauses: 15 * minute, pauseIncluded: 12 * minute }],
    })
  })

  it('starts a new day without yesterday’s unused allowance', () => {
    let state = step(step(empty(), 'start', '09:00'), 'end_session', '10:03')
    const tomorrow = (type: 'start' | 'pause', time: string) =>
      transition(state, { type, at: at(time, '2026-11-10'), id: crypto.randomUUID() })
    state = tomorrow('start', '09:00')
    state = tomorrow('pause', '09:05')
    const now = at('09:10', '2026-11-10')
    expect(report(state, localDay(now, zone), now)).toMatchObject({ included: 0, extra: 5 * minute })
  })

  it('T4 freezes focus only on page close and resumes explicitly', () => {
    const running = step(empty(), 'start', '10:00')
    expect(step(running, 'tick', '10:05')).toBe(running)
    const closed = step(running, 'page_closed', '10:05')
    const state = recover(closed, at('11:05'), crypto.randomUUID())
    expect(current(state).mode).toBe('focus_paused')
    expect(total(activity(state), 'focus', at('11:05'))).toBe(5 * minute)
    expect(total(activity(state), 'system_interruption', at('11:05'))).toBe(60 * minute)
    expect(sum(state, '11:05').overage).toBe(0)
  })

  it('T5 ends manual pause when the page closes', () => {
    let state = step(empty(), 'start', '10:00')
    state = step(state, 'pause', '10:05')
    state = step(state, 'page_closed', '10:07')
    state = recover(state, at('10:30'), crypto.randomUUID())
    expect(total(activity(state), 'system_interruption', at('10:30'))).toBe(23 * minute)
    expect(sum(state, '10:30')).toMatchObject({ focus: 5 * minute, pauses: 2 * minute, overage: 0 })
  })

  it('uses an inferred checkpoint when the page never reported closure', () => {
    const state = recover({ ...step(empty(), 'start', '10:00'), checkpoint: at('10:05') }, at('11:05'), crypto.randomUUID())
    expect(current(state).interval).toMatchObject({ quality: 'inferred', start: at('10:05') })
    expect(sum(state, '11:05').focus).toBe(5 * minute)
  })

  it('T6 keeps break time accruing during closure', () => {
    let state = step(empty(), 'start', '11:00')
    state = step(state, 'tick', '12:00')
    state = step(state, 'page_closed', '12:05')
    state = recover(state, at('14:00'), crypto.randomUUID())
    expect(current(state).mode).toBe('break_running')
    expect(sum(state, '14:00')).toMatchObject({ rest: 120 * minute, overage: 105 * minute })
  })

  it('T7 ends a break at yesterday’s cutoff', () => {
    let state = step(empty(), 'start', '19:00')
    state = step(state, 'page_closed', '20:05')
    state = recover(state, at('09:00', '2026-11-10'), crypto.randomUUID())
    expect(activity(state).rest).toMatchObject({ end: at('20:30'), reason: 'daily_cutoff' })
    expect(sum(state)).toMatchObject({ rest: 30 * minute, overage: 15 * minute })
  })

  it('T8 credits partial focus, locks Start, and gives cutoff priority over completion', () => {
    let state = step(step(empty(), 'start', '20:20'), 'tick', '20:40')
    expect(activity(state)).toMatchObject({ status: 'ended_early', reason: 'daily_cutoff', end: at('20:30') })
    expect(sum(state).focus).toBe(10 * minute)
    expect(step(state, 'start', '20:41')).toBe(state)
    state = transition(state, { type: 'start', at: at('09:00', '2026-11-10'), id: crypto.randomUUID() })
    expect(current(state).mode).toBe('focus_running')
    const tie = step(step(empty(), 'start', '19:30'), 'tick', '20:30')
    expect(activity(tie).rest).toBeUndefined()
    expect(sum(tie).focus).toBe(60 * minute)
  })

  it('T9 caps system interruption at the cutoff without charging extra', () => {
    let state = step(step(empty(), 'start', '19:00'), 'page_closed', '19:05')
    state = recover(state, at('09:00', '2026-11-10'), crypto.randomUUID())
    expect(total(activity(state), 'system_interruption', at('20:30'))).toBe(85 * minute)
    expect(sum(state)).toMatchObject({ focus: 5 * minute, overage: 0, away: 85 * minute, recorded: 90 * minute })
  })

  it('T10 ends partial work or break and leaves gaps untracked', () => {
    let state = step(step(empty(), 'start', '10:00'), 'end_session', '10:17')
    expect(activity(state).rest).toBeUndefined()
    expect(current(state).mode).toBe('idle')
    state = step(step(state, 'start', '11:00'), 'end_session', '12:19')
    expect(state.blocks).toHaveLength(2)
    expect(sum(state)).toMatchObject({ focus: 77 * minute, rest: 19 * minute, overage: 4 * minute })
  })

  it('T11 ignores duplicate and inapplicable Start actions', () => {
    const action = { type: 'start', at: at('11:00'), id: crypto.randomUUID() } as const
    const state = transition(empty(), action)
    expect(transition(state, action)).toBe(state)
    expect(transition(state, { ...action, id: crypto.randomUUID() })).toBe(state)
  })

  it('T12 splits a break at local midnight and applies overage only after its threshold', () => {
    const state = step(step(empty(), 'start', '19:00'), 'end_session', '20:30')
    const cycle = activity(state)
    cycle.rest!.start = at('23:50')
    cycle.rest!.end = at('00:15', '2026-11-10')
    expect(sum(state)).toMatchObject({ rest: 10 * minute, included: 10 * minute, overage: 0, entries: [{ rest: 10 * minute }] })
    expect(report(state, localDay(at('09:00', '2026-11-10'), zone), at('09:00', '2026-11-10')))
      .toMatchObject({ rest: 15 * minute, included: 5 * minute, overage: 10 * minute, entries: [{ rest: 15 * minute }] })
    expect(weekOf(at('10:00', '2026-11-15'), zone).toString()).toBe('2026-11-09')
  })

  it('resolves cutoff and reporting days with IANA DST rules', () => {
    const date = Date.parse('2026-03-08T14:00:00Z')
    const day = localDay(date, zone)
    expect(localInstant(day.add({ days: 1 }), zone) - localInstant(day, zone)).toBe(23 * 60 * minute)
    expect(cutoff(date, zone, '20:30')).toBe(Date.parse('2026-03-09T00:30:00Z'))
  })

  it('keeps target and allowance snapshots when settings change during focus', () => {
    let state = step(empty(), 'start', '11:00')
    state = transition(state, { type: 'settings_changed', id: crypto.randomUUID(), at: at('11:05'),
      settings: { ...state.settings, target: 30 * minute, allowance: 10 * minute } })
    state = step(state, 'tick', '12:00')
    expect(activity(state)).toMatchObject({ target: 60 * minute, rest: { allowance: 15 * minute } })
    state = step(state, 'start', '12:05')
    expect(activity(state)).toMatchObject({ target: 30 * minute, allowance: 10 * minute })
  })
})
