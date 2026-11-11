import { cutoff, localDay } from './time'

import type { AlertSound } from './alerts'

export type Settings = {
  target: number; allowance: number; time: string; zone: string
  sound?: AlertSound; notifications?: boolean
}
export const defaults = (zone: string): Settings => ({ target: 3600_000, allowance: 900_000, time: '20:30', zone })
export type Kind = 'focus' | 'manual_pause' | 'system_interruption'
export type Interval = { id: string; kind: Kind; start: number; end?: number; quality: 'observed' | 'inferred' }
export type EndReason = 'manual' | 'daily_cutoff' | 'target' | 'next_start'
export type Break = { id: string; start: number; end?: number; allowance: number; reason?: EndReason }
export type Cycle = {
  id: string; start: number; end?: number; reason?: EndReason
  status: 'running' | 'paused' | 'completed' | 'ended_early'
  target: number; allowance: number; intervals: Interval[]; rest?: Break
}
export type Block = { id: string; start: number; end?: number; reason?: EndReason; policy: Settings; cutoff: number; cycles: Cycle[] }
export type ActivityEvent = { id: string; type: string; at: number; blockId?: string; cycleId?: string; payload?: Settings }
export type Tracker = { settings: Settings; blocks: Block[]; events: ActivityEvent[]; checkpoint: number }
export type Action =
  | { type: 'start' | 'pause' | 'resume' | 'end_session' | 'page_closed' | 'recovered' | 'tick'; at: number; id: string }
  | { type: 'settings_changed'; at: number; id: string; settings: Settings }

export const initial = (settings: Settings): Tracker => ({ settings, blocks: [], events: [], checkpoint: 0 })
export const span = (interval: { start: number; end?: number }, now: number) => Math.max(0, (interval.end ?? now) - interval.start)
export const total = (cycle: Cycle, kind: Kind, now: number) =>
  cycle.intervals.filter(interval => interval.kind === kind).reduce((sum, interval) => sum + span(interval, now), 0)

export function current(state: Tracker) {
  const last = state.blocks.at(-1)
  const block = last?.end === undefined ? last : undefined
  const cycle = block?.cycles.at(-1)
  const interval = cycle?.intervals.at(-1)
  const mode = !cycle ? 'idle' : cycle.rest ? 'break_running' : cycle.status === 'paused' ? 'focus_paused' : 'focus_running'
  return { block, cycle, interval, mode } as const
}

export function startLocked(state: Tracker, at: number) {
  const last = state.blocks.at(-1)
  const { zone, time } = state.settings
  return at >= cutoff(at, zone, time) ||
    (last?.reason === 'daily_cutoff' && localDay(last.cutoff, last.policy.zone).equals(localDay(at, last.policy.zone)))
}

export function deadline(state: Tracker, at: number) {
  const { block, cycle, interval, mode } = current(state)
  if (!block || !cycle || !interval) return undefined
  const targetAt = mode === 'focus_running'
    ? interval.start + cycle.target - total(cycle, 'focus', interval.start)
    : Infinity
  if (block.cutoff <= at && block.cutoff <= targetAt) return { type: 'daily_cutoff', at: block.cutoff }
  if (targetAt <= at) return { type: 'focus_completed', at: targetAt }
  return undefined
}

export function transition(previous: Tracker, action: Action): Tracker {
  if (action.type !== 'tick' && previous.events.some(event => event.id === action.id)) return previous
  const due = deadline(previous, action.at)
  const { mode: oldMode } = current(previous)
  if (!due && (action.type === 'tick' ||
    (['page_closed', 'recovered'].includes(action.type) && !oldMode.startsWith('focus')))) return previous

  // Share completed history. Only the active block and the arrays being appended are copied.
  const state: Tracker = { ...previous, blocks: [...previous.blocks], events: [...previous.events] }
  if (current(previous).block) state.blocks[state.blocks.length - 1] = structuredClone(current(previous).block!)
  let sequence = 0
  let changed = false
  const id = () => action.id.slice(0, -4) + (parseInt(action.id.slice(-4), 16) ^ ++sequence).toString(16).padStart(4, '0')
  const event = (type: string, at: number, eventId = id(), payload?: Settings) => {
    const { block, cycle } = current(state)
    state.events.push({
      id: eventId, type, at,
      ...(block && { blockId: block.id }),
      ...(cycle && { cycleId: cycle.id }),
      ...(payload && { payload }),
    })
    changed = true
  }
  const finish = (at: number, reason: 'manual' | 'daily_cutoff') => {
    const { block, cycle, interval } = current(state)
    if (!block || !cycle || !interval) return
    event(reason === 'manual' ? 'end_session' : reason, at, reason === 'manual' ? action.id : id())
    if (cycle.rest) {
      Object.assign(cycle.rest, { end: at, reason })
      event('break_ended', at)
    } else {
      interval.end = at
      Object.assign(cycle, { end: at, reason, status: 'ended_early' })
    }
    Object.assign(block, { end: at, reason })
  }

  if (due?.type === 'focus_completed') {
    const { cycle, interval } = current(state)
    interval!.end = due.at
    Object.assign(cycle!, { status: 'completed', end: due.at, reason: 'target' })
    event('focus_completed', due.at)
    cycle!.rest = { id: id(), start: due.at, allowance: cycle!.allowance }
    event('break_started', due.at)
  }
  const dueAfterCompletion = deadline(state, action.at)
  if (dueAfterCompletion?.type === 'daily_cutoff') finish(dueAfterCompletion.at, 'daily_cutoff')

  const at = Math.max(action.at, previous.checkpoint)
  const { block, cycle, interval, mode } = current(state)
  if (action.type === 'settings_changed') {
    state.settings = action.settings
    event(action.type, at, action.id, action.settings)
  } else if (action.type === 'start' && (mode === 'idle' || mode === 'break_running') &&
      !startLocked(state, at)) {
    if (cycle?.rest) {
      Object.assign(cycle.rest, { end: at, reason: 'next_start' })
      event('break_ended', at)
    }
    const policy = { ...state.settings }
    const destination = block ?? { id: id(), start: at, policy, cutoff: cutoff(at, policy.zone, policy.time), cycles: [] }
    if (!block) state.blocks.push(destination)
    destination.cycles.push({
      id: id(), start: at, status: 'running', target: policy.target, allowance: policy.allowance,
      intervals: [{ id: id(), kind: 'focus', start: at, quality: 'observed' }],
    })
    event(action.type, at, action.id)
  } else if (action.type === 'end_session' && block) {
    finish(at, 'manual')
  } else if (cycle && interval && !cycle.rest) {
    let kind: Kind | undefined
    if (action.type === 'pause' && mode === 'focus_running') kind = 'manual_pause'
    if (action.type === 'resume' && mode === 'focus_paused') kind = 'focus'
    if (['page_closed', 'recovered'].includes(action.type) && interval.kind !== 'system_interruption') kind = 'system_interruption'
    if (kind) {
      interval.end = at
      cycle.status = kind === 'focus' ? 'running' : 'paused'
      cycle.intervals.push({ id: id(), kind, start: at, quality: action.type === 'recovered' ? 'inferred' : 'observed' })
      event(action.type, at, action.id)
    }
  }
  if (!changed) return previous
  state.checkpoint = at
  return state
}

export function recover(state: Tracker, now: number, id: string) {
  const { mode, interval } = current(state)
  if (mode.startsWith('focus') && interval?.kind !== 'system_interruption') {
    state = transition(state, { type: 'recovered', at: Math.min(state.checkpoint, now), id })
  }
  return transition(state, { type: 'tick', at: now, id: id.slice(0, -5) + (id.at(-5) === '0' ? '1' : '0') + id.slice(-4) })
}
