import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import type { User } from '@supabase/supabase-js'
import { avatarUrl, cloud, demo, uploadAvatar } from './cloud'
import { current, span, startLocked, total, type Settings, type Tracker } from './engine'
import { clockText, minute } from './time'
import { Metrics } from './Metrics'
import { useTracker } from './useTracker'
import './style.css'

function Focus({ state, at, dispatch }: {
  state: Tracker; at: number; dispatch: ReturnType<typeof useTracker>['dispatch']
}) {
  const { cycle, mode, interval } = current(state)
  const dialog = useRef<HTMLDialogElement>(null)
  const menu = useRef<HTMLDetailsElement>(null)
  const locked = (mode === 'idle' || mode === 'break_running') && startLocked(state, at)
  const rest = cycle?.rest
  const elapsed = rest ? span(rest, at) : 0
  const remaining = cycle ? cycle.target - total(cycle, 'focus', at) : state.settings.target
  const label = mode === 'focus_running' ? 'Pause' : mode === 'focus_paused' ? 'Resume' : 'Start'
  const status = mode === 'break_running' ? 'Break'
    : mode === 'focus_paused' ? (interval?.kind === 'system_interruption' ? 'Paused while away' : 'Paused')
    : locked ? 'Finished for today' : 'Focus'
  return <section className="timer-panel" aria-label="Focus timer">
    {mode !== 'idle' && <details className="overflow" ref={menu}>
      <summary aria-label="Session options">⋯</summary>
      <button onClick={() => { menu.current!.open = false; dialog.current!.showModal() }}>End Session</button>
    </details>}
    <h1 aria-live="polite">{status}</h1>
    <div className="digits" role="timer">{clockText(rest ? elapsed : remaining, !!rest)}</div>
    <div className="timer-note">{rest && elapsed > rest.allowance ? `+${clockText(elapsed - rest.allowance, true)} extra` : ''}</div>
    <button className="primary timer-action" disabled={locked} onClick={() => {
      dispatch(label === 'Start' ? 'start' : label === 'Pause' ? 'pause' : 'resume')
    }}>{label}</button>
    <dialog ref={dialog} aria-labelledby="end-heading">
      <h2 id="end-heading">End session?</h2>
      <p>Your progress will be saved, and tracking will stop.</p>
      <form method="dialog" className="dialog-actions">
        <button className="quiet" autoFocus>Cancel</button>
        <button className="primary" onClick={() => dispatch('end_session')}>End Session</button>
      </form>
    </dialog>
  </section>
}

function Profile({ state, user, image, setImage, save, signOut }: {
  state: Tracker; user: User | null; image?: string; setImage: (image?: string) => void
  save: (settings: Settings) => void; signOut: () => void
}) {
  const [message, setMessage] = useState('')
  const [uploading, setUploading] = useState(false)
  const zones = [...new Set([state.settings.zone, 'UTC', ...Intl.supportedValuesOf('timeZone')])].sort()
  const onSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    save({ target: Number(form.get('target')) * minute, allowance: Number(form.get('allowance')) * minute,
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
      <button className="primary">Save settings</button>
    </form>
    {user && <div className="profile">
      <h2>Profile</h2>
      <p>{user.email}</p>
      {image && <img className="avatar" src={image} alt="Your profile photo" />}
      <label>Upload avatar<input type="file" disabled={uploading} accept="image/jpeg,image/png,image/webp" onChange={async event => {
        const file = event.currentTarget.files?.[0]
        if (!file) return
        setUploading(true)
        try { setImage(await uploadAvatar(file, user)); setMessage('Avatar updated.') }
        catch (error) { setMessage((error as Error).message) }
        finally { setUploading(false) }
      }} /></label>
    </div>}
    <p role="status">{message}</p>
    <div className="profile-actions">
      <button className="quiet" onClick={exportData}>Export activity as JSON</button>
      {user && <button className="quiet" onClick={signOut}>Sign out</button>}
    </div>
  </section>
}

function Workspace({ user }: { user: User | null }) {
  const { view, dispatch, error, retry } = useTracker(user?.id ?? 'demo')
  const [page, setPage] = useState('focus')
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
  const sync = view?.store.status
  return <>
    <header className="top">
      <button className="brand" onClick={() => setPage('focus')} aria-current={page === 'focus' ? 'page' : undefined}>Focus Tracker</button>
      <nav aria-label="Main navigation">
        <button className="quiet" onClick={() => setPage('metrics')} aria-current={page === 'metrics' ? 'page' : undefined}>Metrics</button>
        <button className="avatar" aria-label="Settings" aria-current={page === 'settings' ? 'page' : undefined} onClick={() => setPage('settings')}>
          {image ? <img src={image} alt="" /> : (user?.email?.[0].toUpperCase() ?? '⚙')}
        </button>
      </nav>
    </header>
    <main className={page === 'focus' ? 'focus-page' : 'content-page'}>
      {error ? <div className="report"><p role="alert">{error}</p><button className="quiet" onClick={retry}>Retry</button></div> : !view || !state ? <p role="status">Loading…</p> : <>
        {page === 'focus' && <Focus state={state} at={view.at} dispatch={dispatch} />}
        {page === 'metrics' && <Metrics state={state} at={view.at} />}
        {page === 'settings' && <Profile state={state} user={user} image={image} setImage={url => { setUploaded(true); setImage(url) }} save={settings => dispatch('settings_changed', settings)}
          signOut={async () => {
            dispatch('page_closed')
            await view.store.flush()
            const { error } = await cloud!.auth.signOut()
            if (error) setAuthError(error.message)
          }} />}
        {sync !== 'saved' && <p className="sync" role="status">
          {sync === 'pending' && 'Changes are waiting to sync.'}
          {sync === 'conflict' && 'This account changed elsewhere. Export this browser’s activity from Settings to keep a copy of unsynced changes.'}
          {sync === 'unavailable' && 'Browser storage is unavailable. Recent progress may be lost if you close this page.'}
        </p>}
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
    <h1>Focus Tracker</h1>
    {loading ? <p role="status">Loading…</p> : cloud ? <button className="primary" onClick={async () => {
      const { error } = await cloud!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
      if (error) setError(error.message)
    }}>Sign in with Google</button> : <p>Supabase configuration is required.</p>}
    {error && <p role="alert">{error}</p>}
  </section></main>
}

createRoot(document.getElementById('root')!).render(<App />)
