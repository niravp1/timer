import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import type { User } from '@supabase/supabase-js'
import { readCachedAvatar, rememberAvatar } from './avatarCache'
import { avatarUrl, cloud, demo } from './cloud'
import { current, span, startLocked, total, type Settings, type Tracker } from './engine'
import { breakClockText, clockText, minute } from './time'
import { breakAllowances } from './report'
import { Metrics } from './Metrics'
import { Profile, RecoveryLink } from './Profile'
import { useTracker } from './useTracker'
import { playSound, soundPlayCount, soundPlayOptions, sounds, type AlertSound } from './alerts'
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
  const allowances = rest || interval?.kind === 'manual_pause' ? breakAllowances(state) : undefined
  const allowance = rest ? allowances?.get(rest.id) ?? 0 : 0
  const pauseAllowance = interval?.kind === 'manual_pause' ? allowances?.get(interval.id) ?? 0 : 0
  const pauseElapsed = interval?.kind === 'manual_pause' ? span(interval, at) : 0
  const pauseLeft = Math.max(0, pauseAllowance - pauseElapsed)
  const extra = rest ? elapsed - allowance : pauseElapsed - pauseAllowance
  const locked = (mode === 'idle' || mode === 'break_running') && startLocked(state, at)
  const label = mode === 'focus_running' ? 'Pause' : mode === 'focus_paused' ? 'Resume' : 'Start'
  const status = mode === 'break_running' ? 'Break'
    : mode === 'focus_paused' ? (interval?.kind === 'system_interruption' ? 'Paused while away' : 'Paused')
    : locked ? 'Finished for today' : 'Focus'
  return <section className="timer-panel" aria-label="Focus timer">
    <h1 aria-live="polite">{status}</h1>
    <div className={rest && digits.length > 5 ? 'digits break-digits' : 'digits'} role="timer">{digits}</div>
    <div className="timer-note">{extra > 0 ? `+${breakClockText(extra)} extra` : pauseLeft > 0 ? `${breakClockText(pauseLeft)} of included break left` : ''}</div>
    <button className="primary timer-action" disabled={locked} onClick={() => {
      dispatch(label === 'Start' ? 'start' : label === 'Pause' ? 'pause' : 'resume')
    }}>{label}</button>
  </section>
}

function SettingsPage({ state, save }: { state: Tracker; save: (settings: Partial<Settings>) => void }) {
  const [message, setMessage] = useState('')
  const [sound, setSound] = useState<AlertSound>(state.settings.sound ?? 'chime')
  const [soundPlays, setSoundPlays] = useState(() => soundPlayCount(state.settings.soundPlays))
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
    save({ sound, soundPlays, target: Number(form.get('target')) * minute, allowance: Number(form.get('allowance')) * minute,
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
          void playSound(sound, soundPlays).catch(() => setMessage('This browser could not play the sound.'))
        }>Preview sound</button>
      </div>
      <label>Play each alert sound<select value={soundPlays} disabled={sound === 'silent'}
        onChange={event => setSoundPlays(soundPlayCount(Number(event.target.value)))}>
        {soundPlayOptions.map(count => <option key={count} value={count}>{count} {count === 1 ? 'time' : 'times'}</option>)}
      </select></label>
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
  const [photo, setPhoto] = useState<Blob | string>()
  const [profileImage, setProfileImage] = useState<string>()
  const [authError, setAuthError] = useState('')
  const uploaded = useRef(false)
  const account = user?.id
  const avatar = view?.avatar
  const googlePhoto = user?.user_metadata.avatar_url as string | undefined
  useEffect(() => {
    if (!account) return
    let active = true
    void readCachedAvatar(account).then(cached => {
      if (active && cached) setPhoto(current => current ?? cached)
    })
    return () => { active = false }
  }, [account])
  useEffect(() => {
    if (!account || avatar === undefined || uploaded.current) return
    if (!avatar) {
      setPhoto(googlePhoto)
      return
    }
    const controller = new AbortController()
    void (async () => {
      const url = await avatarUrl(avatar, user)
      if (!url || controller.signal.aborted || uploaded.current) return
      try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) throw new Error('Could not load profile photo')
        const picture = await response.blob()
        if (controller.signal.aborted || uploaded.current) return
        setPhoto(picture)
        void rememberAvatar(account, picture)
      } catch {
        if (!controller.signal.aborted && !uploaded.current) setPhoto(current => current ?? url)
      }
    })().catch(() => { /* Keep the cached picture if signing fails. */ })
    return () => controller.abort()
  }, [account, avatar, googlePhoto])
  useEffect(() => {
    if (!photo) return
    const url = typeof photo === 'string' ? photo : URL.createObjectURL(photo)
    const image = new Image()
    image.referrerPolicy = 'no-referrer'
    image.src = url
    let active = true
    let displayed = false
    void image.decode().then(() => {
      if (active) {
        displayed = true
        setProfileImage(url)
      }
    }).catch(() => { /* Keep the previously displayed picture if loading fails. */ })
    return () => {
      active = false
      if (!displayed && typeof photo !== 'string') URL.revokeObjectURL(url)
    }
  }, [photo])
  useEffect(() => () => {
    if (profileImage?.startsWith('blob:')) URL.revokeObjectURL(profileImage)
  }, [profileImage])
  const state = view?.store.journal.state
  const title = state && view ? tabTitle(state, view.at) : 'Focus'
  useEffect(() => { document.title = title }, [title])
  useEffect(() => () => { document.title = 'Focus' }, [])
  const sync = view?.store.status
  const backups = page === 'settings' ? view?.store.backups() : undefined
  function downloadBackups() {
    const backup = new Blob([JSON.stringify(backups, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(backup)
    const link = document.createElement('a')
    link.href = url
    link.download = 'focus-tracker-sync-backups.json'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <>
    <header className="top">
      {user && profileImage && <button className="avatar header-avatar" type="button" aria-label="Open profile"
        aria-current={page === 'profile' ? 'page' : undefined} onClick={() => {
          if (menu.current) menu.current.open = false
          setPage('profile')
        }}>
        <img src={profileImage} alt="" referrerPolicy="no-referrer" />
      </button>}
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
        {page === 'profile' && user && <Profile user={user} image={profileImage}
          setImage={file => {
            uploaded.current = true
            setPhoto(file)
            void rememberAvatar(user.id, file)
          }}
          signOut={async () => {
            dispatch('page_closed')
            await view.store.flush()
            const { error } = await cloud!.auth.signOut()
            if (error) setAuthError(error.message)
          }} />}
        {page === 'settings' && !!backups?.length && <div className="sync">
          <button className="quiet" onClick={downloadBackups}>Download local sync backups</button>
        </div>}
        {sync === 'unavailable' && <p className="sync" role="status">
          Browser storage is unavailable. Keep this tab open to protect unsynced activity.
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
