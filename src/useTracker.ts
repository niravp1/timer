import { breakAllowances } from './report'
import { useEffect, useState } from 'react'
import { current, recover, transition, type Action, type Settings } from './engine'
import { cloud, demo, readRemote, zone } from './cloud'
import { notifyTimer, playSound, prepareSound, requestNotificationsOnStart } from './alerts'
import { hydrate, Persistence, type Journal } from './persistence'

function announce(settings: Settings, event: Parameters<typeof notifyTimer>[0]) {
  void playSound(settings.sound ?? 'chime', settings.soundPlays).catch(() => {})
  if (settings.notifications !== false) notifyTimer(event)
}

function announceCompletion(previous: Journal['state'], next: Journal['state']) {
  if (current(next).mode !== 'break_running' ||
      !next.events.slice(previous.events.length).some(event => event.type === 'focus_completed')) return
  announce(next.settings, 'focus-complete')
}

export function useTracker(account: string) {
  const [view, setView] = useState<{ store: Persistence; at: number; now: () => number; avatar: string | null | undefined }>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let disposed = false
    let release: (() => void) | undefined
    let stop: (() => void) | undefined
    const key = `focus-tracker:v1:${account}`
    const connect = async () => {
      let cached: Journal | undefined
      try {
        const raw = localStorage.getItem(key)
        cached = raw ? JSON.parse(raw) : undefined
      } catch { /* An unavailable cache is reported when saving. */ }
      const remote = cloud ? readRemote() : undefined
      const initialRemote = !cached && remote ? await remote : { revision: 0, state: null, avatar: null }
      if (disposed) return
      // A cached journal does not tell us whether the account has an uploaded avatar.
      let avatar = cached && remote ? undefined : initialRemote.avatar
      const refresh = () => {
        if (!disposed) setView({ store, at: now(), now, avatar })
      }
      const store = new Persistence(key, cached ?? hydrate(undefined, initialRemote, zone), demo, refresh)
      let wall = Date.now()
      let monotonic = performance.now()
      // Use monotonic elapsed time within the page, and wall time to recover across page loads.
      const now = () => wall + Math.max(0, Math.floor(performance.now() - monotonic))
      const reconcile = () => {
        const previous = store.journal.state
        const next = recover(previous, now(), crypto.randomUUID())
        if (next !== previous) store.save(next)
      }
      reconcile()
      void store.flush()
      refresh()
      if (cached && remote) {
        void remote.then(latest => {
          if (disposed) return
          avatar = latest.avatar
          const journal = store.journal
          const clean = !store.busy && !journal.pending && journal.dirty.length === 0 &&
            journal.state.events.length === journal.eventOffset
          if (clean && latest.revision > journal.revision) {
            store.journal = hydrate(undefined, latest, zone)
            store.save(store.journal.state, true)
            reconcile()
          }
          refresh()
        }).catch(() => { /* The cached tracker stays usable if the refresh fails. */ })
      }
      let lastRenderAt = now()
      const render = () => {
        const at = now()
        const previous = store.journal.state
        const next = transition(previous, { type: 'tick', at, id: crypto.randomUUID() })
        if (next !== previous) {
          store.save(next)
          announceCompletion(previous, next)
        } else if (current(previous).mode.startsWith('focus') && at - previous.checkpoint >= 5000) {
          store.save({ ...previous, checkpoint: at }, true)
        }
        const rest = current(next).cycle?.rest
        const allowance = rest ? breakAllowances(next).get(rest.id) ?? 0 : 0
        if (rest && allowance > 0) {
          const allowanceEnd = rest.start + allowance
          if (lastRenderAt < allowanceEnd && allowanceEnd <= at) announce(next.settings, 'break-allowance')
        }
        lastRenderAt = at
        refresh()
      }
      const hide = () => {
        const previous = store.journal.state
        const next = transition(previous, { type: 'page_closed', at: now(), id: crypto.randomUUID() })
        if (next !== previous) store.save(next)
      }
      const show = (event: PageTransitionEvent) => {
        if (!event.persisted) return
        wall = Date.now()
        monotonic = performance.now()
        lastRenderAt = now()
        reconcile()
        refresh()
      }
      const retry = () => void store.flush()
      const ticker = window.setInterval(render, 250)
      const retries = window.setInterval(retry, 10_000)
      window.addEventListener('pagehide', hide)
      window.addEventListener('pageshow', show)
      window.addEventListener('online', retry)
      document.addEventListener('visibilitychange', render)
      stop = () => {
        window.clearInterval(ticker)
        window.clearInterval(retries)
        window.removeEventListener('pagehide', hide)
        window.removeEventListener('pageshow', show)
        window.removeEventListener('online', retry)
        document.removeEventListener('visibilitychange', render)
        hide()
      }
    }
    const start = async () => {
      if (!navigator.locks) return connect()
      return navigator.locks.request(key, { ifAvailable: true }, async lock => {
        if (disposed) return
        if (!lock) throw new Error('Focus Tracker is open in another tab. Close it there and retry.')
        await connect()
        if (!disposed) await new Promise<void>(resolve => { release = resolve })
      })
    }
    void start().catch(error => {
      if (!disposed) setError(error.message || 'Could not load Focus Tracker.')
    })
    return () => { disposed = true; stop?.(); release?.() }
  }, [account, attempt])

  function dispatch(type: Exclude<Action['type'], 'tick' | 'settings_changed'> | 'settings_changed', settings?: Settings) {
    if (!view) return
    if ((type === 'start' || type === 'resume') && view.store.journal.state.settings.sound !== 'silent') {
      void prepareSound().catch(() => {})
    }
    // Reuse the page clock for button events without quantizing to the render interval.
    const at = view.now()
    const id = crypto.randomUUID()
    const action: Action = type === 'settings_changed' ? { type, at, id, settings: settings! } : { type, at, id }
    const previous = view.store.journal.state
    const next = transition(previous, action)
    if (next !== previous) {
      if (type === 'start' && current(next).mode === 'focus_running' && next.settings.notifications !== false) {
        requestNotificationsOnStart()
      }
      view.store.save(next)
      announceCompletion(previous, next)
      setView({ ...view })
    }
  }

  return { view, dispatch, error, retry: () => { setError(''); setAttempt(n => n + 1) } }
}
