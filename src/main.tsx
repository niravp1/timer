import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import type { User } from '@supabase/supabase-js'
import { avatarUrl, cloud, demo } from './cloud'
import { current, span, startLocked, total, type Settings, type Tracker } from './engine'
import { breakClockText, clockText, minute } from './time'
import { Metrics } from './Metrics'
import { Profile, RecoveryLink } from './Profile'
import { useTracker } from './useTracker'
import { playSound, sounds, type AlertSound } from './alerts'
import './style.css'

function timerDisplay(state: Tracker, at: number) {
  const { cycle, mode, interval } = current(state)
  const rest = cycle?.rest
  const elapsed = rest ? span(rest, at) : 0
  const remaining = cycle ? cycle.target - total(cycle, 'focus', at) : state.settings.target
  const digits = rest ? breakClockText(elapsed) : clockText(remaining)
  return { mode, interval, rest, elapsed, digits }
}

function tabTitle(state: Tracker, at: number) {
  const { mode, digits } = timerDisplay(state, at)
  if (mode === 'idle') return startLocked(state, at) ? 'Finished for today' : 'Focus'
  if (mode === 'focus_running') return digits
  const label = mode === 'break_running' ? 'Break' : 'Focus paused'
  return `${digits} - ${label}`
}

function Focus({ state, at, dispatch }: {
  state: Tracker; at: number; dispatch: ReturnType<typeof useTracker>['dispatch']
}) {
  const { mode, interval, rest, elapsed, digits } = timerDisplay(state, at)
  const locked = (mode === 'idle' || mode === 'break_running') && startLocked(state, at)
  const label = mode === 'focus_running' ? 'Pause' : mode === 'focus_paused' ? 'Resume' : 'Start'
  const status = mode === 'break_running' ? 'Break'
    : mode === 'focus_paused' ? (interval?.kind === 'system_interruption' ? 'Paused while away' : 'Paused')
    : locked ? 'Finished for today' : 'Focus'
  return <section className="timer-panel" aria-label="Focus timer">
    <h1 aria-live="polite">{status}</h1>
    <div className={rest ? 'digits break-digits' : 'digits'} role="timer">{digits}</div>
    <div className="timer-note">{rest && elapsed > rest.allowance ? `+${breakClockText(elapsed - rest.allowance)} extra` : ''}</div>
    <button className="primary timer-action" disabled={locked} onClick={() => {
      dispatch(label === 'Start' ? 'start' : label === 'Pause' ? 'pause' : 'resume')
    }}>{label}</button>
  </section>
}

function SettingsPage({ state, save }: { state: Tracker; save: (settings: Partial<Settings>) => void }) {
  const [message, setMessage] = useState('')
  const [sound, setSound] = useState<AlertSound>(state.settings.sound ?? 'chime')
  const [permission, setPermission] = useState(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  const enableNotifications = async () => {
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result === 'granted') {
        save({ notifications: true })
        setMessage('Browser notifications enabled.')
      } else if (result === 'default') setMessage('Notification permission was skipped.')
    } catch { setMessage('This browser could not enable notifications.') }
  }
  const zones = [...new Set([state.settings.zone, 'UTC', ...Intl.supportedValuesOf('timeZone')])].sort()
  const onSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    save({ sound, target: Number(form.get('target')) * minute, allowance: Number(form.get('allowance')) * minute,
      zone: String(form.get('zone')), time: String(form.get('cutoff')) })
    setMessage('Settings updated.')
  }
  const exportData = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({
      ...state, exportedAt: new Date().toISOString(), timeFormat: 'Unix milliseconds (UTC)',
    }, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'focus-tracker.json'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="report settings">
    <h1>Settings</h1>
    <form onSubmit={onSave}>
      <label>Focus target (minutes)<input name="target" type="number" min="1" max="1440" required defaultValue={state.settings.target / minute} /></label>
      <label>Included break (minutes)<input name="allowance" type="number" min="0" max="1440" required defaultValue={state.settings.allowance / minute} /></label>
      <label>Daily cutoff<input name="cutoff" type="time" required defaultValue={state.settings.time} /></label>
      <label>Time zone<select name="zone" defaultValue={state.settings.zone}>{zones.map(zone => <option key={zone}>{zone}</option>)}</select></label>
      {current(state).block && <p className="split">Your current work block keeps its original cutoff. New focus and break targets apply from the next cycle.</p>}
      <div className="sound-setting">
        <label>Timer alert sound<select value={sound} onChange={event => setSound(event.target.value as AlertSound)}>
          {Object.entries(sounds).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}
        </select></label>
        <button className="quiet" type="button" disabled={sound === 'silent'} onClick={() =>
          void playSound(sound).catch(() => setMessage('This browser could not play the sound.'))
        }>Preview sound</button>
      </div>
      <button className="primary">Save settings</button>
    </form>
    <div className="profile">
      <h2>Browser notifications</h2>
      {permission === 'unsupported' || typeof Notification.requestPermission !== 'function'
        ? <p>This browser does not support desktop notifications.</p>
        : permission === 'denied'
        ? <p>Allow notifications for this site in your browser settings, then reload.</p>
        : <>
          <label className="checkbox"><input type="checkbox" checked={state.settings.notifications !== false}
              onChange={event => save({ notifications: event.target.checked })} />
              Notify me when focus or the break allowance ends</label>
          {permission === 'default' && state.settings.notifications !== false &&
            <button className="quiet" onClick={enableNotifications}>Allow browser notifications</button>}
        </>}
    </div>
    <p role="status">{message}</p>
    <div className="profile-actions">
      <button className="quiet" onClick={exportData}>Export activity as JSON</button>
    </div>
  </section>
}

function Workspace({ user }: { user: User | null }) {
  const { view, dispatch, error, retry } = useTracker(user?.id ?? 'demo')
  const [page, setPage] = useState('focus')
  const menu = useRef<HTMLDetailsElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  function closeMenu() {
    if (menu.current) menu.current.open = false
    menu.current?.querySelector('summary')?.focus()
  }
  const [image, setImage] = useState<string>()
  const [authError, setAuthError] = useState('')
  const [uploaded, setUploaded] = useState(false)
  const avatar = uploaded ? `${user?.id}/avatar` : view?.avatar
  useEffect(() => {
    if (avatar === undefined) return
    let active = true
    const refresh = () => void avatarUrl(avatar, user)
      .then(url => { if (active) setImage(url) })
      .catch(() => { if (active) setImage(undefined) })
    refresh()
    const interval = window.setInterval(refresh, 50 * 60_000)
    return () => { active = false; window.clearInterval(interval) }
  }, [avatar, user?.id])
  const state = view?.store.journal.state
  const title = state && view ? tabTitle(state, view.at) : 'Focus'
  useEffect(() => { document.title = title }, [title])
  useEffect(() => () => { document.title = 'Focus' }, [])
  const sync = view?.store.status
  const [restoring, setRestoring] = useState(false)
  const showSync = sync === 'conflict' || sync === 'unavailable' || sync === 'pending'
  async function restoreCloud() {
    if (!view || restoring) return
    setRestoring(true)
    setAuthError('')
    try {
      const backup = new Blob([JSON.stringify(view.store.journal.state, null, 2)], { type: 'application/json' })
      await view.store.restoreCloud()
      const url = URL.createObjectURL(backup)
      const link = document.createElement('a')
      link.href = url
      link.download = 'focus-tracker-sync-backup.json'
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setAuthError('Could not load cloud history. Your local changes are still here.')
    } finally {
      setRestoring(false)
    }
  }
  return <>
    <header className="top">
      <details className="app-menu" ref={menu} onKeyDown={event => {
        if (event.key === 'Escape' && menu.current?.open) closeMenu()
      }} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false
      }}>
        <summary aria-label="Menu"><span aria-hidden="true" className="hamburger" /></summary>
        <nav aria-label="Main navigation">
          {['Focus', 'Metrics', 'Settings', ...(user ? ['Profile'] : [])].map(label => <button className="quiet" key={label}
            aria-current={page === label.toLowerCase() ? 'page' : undefined}
            onClick={() => { setPage(label.toLowerCase()); closeMenu() }}>{label}</button>)}
          {state && current(state).mode !== 'idle' && <button className="quiet" onClick={() => {
            closeMenu()
            dialog.current?.showModal()
          }}>End Session</button>}
        </nav>
      </details>
    </header>
    <dialog ref={dialog} aria-labelledby="end-heading">
      <h2 id="end-heading">End session?</h2>
      <p>Your progress will be saved, and tracking will stop.</p>
      <form method="dialog" className="dialog-actions">
        <button className="quiet" autoFocus>Cancel</button>
        <button className="primary" onClick={() => dispatch('end_session')}>End Session</button>
      </form>
    </dialog>
    <main className={page === 'focus' ? 'focus-page' : 'content-page'}>
      {error ? <div className="report"><p role="alert">{error}</p><button className="quiet" onClick={retry}>Retry</button></div> : !view || !state ? <p role="status">Loading…</p> : <>
        {page === 'focus' && <Focus state={state} at={view.at} dispatch={dispatch} />}
        {page === 'metrics' && <Metrics state={state} at={view.at} />}
        {page === 'settings' && <SettingsPage state={state}
          save={settings => dispatch('settings_changed', { ...view.store.journal.state.settings, ...settings })} />}
        {page === 'profile' && user && <Profile user={user} image={image}
          setImage={url => { setUploaded(true); setImage(url) }}
          signOut={async () => {
            dispatch('page_closed')
            await view.store.flush()
            const { error } = await cloud!.auth.signOut()
            if (error) setAuthError(error.message)
          }} />}
        {sync === 'conflict' && page !== 'settings' && <button className="quiet sync" onClick={() => setPage('settings')}>
          Cloud sync needs attention
        </button>}
        {(page === 'settings' || sync === 'unavailable') && showSync && <div className="sync" role="status">
          {sync === 'pending' && 'Cloud backup is pending. Changes are saved in this browser.'}
          {sync === 'conflict' && <>
            <p>This browser and the cloud have overlapping changes. Save a backup of this browser’s activity before reopening cloud history.</p>
            <button className="quiet" disabled={restoring} onClick={() => void restoreCloud()}>Back up and use cloud history</button>
          </>}
          {sync === 'unavailable' && 'Browser storage is unavailable. Recent progress may be lost if you close this page.'}
        </div>}
      </>}
      {authError && <p role="alert">{authError}</p>}
    </main>
  </>
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!!cloud)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!cloud) return
    const { data: { subscription } } = cloud.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])
  if (demo || user) return <Workspace key={user?.id ?? 'demo'} user={user} />
  return <main className="focus-page auth-page"><section className="timer-panel auth">
    <h1>Sign in</h1>
    {loading ? <p role="status">Loading…</p> : cloud ? <button className="primary" onClick={async () => {
      const { error } = await cloud!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
      if (error) setError(error.message)
    }}>Sign in with Google</button> : <p>Supabase configuration is required.</p>}
    {cloud && !loading && <p className="recovery-link"><RecoveryLink /></p>}
    {error && <p role="alert">{error}</p>}
  </section></main>
}

createRoot(document.getElementById('root')!).render(<App />)
