import { useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { saveUsername, uploadAvatar } from './cloud'

export function RecoveryLink() {
  return <a href="https://accounts.google.com/signin/recovery" target="_blank" rel="noopener noreferrer">
    Recover your Google account
  </a>
}

export function Profile({ user, image, setImage, signOut }: {
  user: User; image?: string; setImage: (image?: string) => void; signOut: () => Promise<void>
}) {
  const initialName = typeof user.user_metadata.tracker_username === 'string' ? user.user_metadata.tracker_username : ''
  const [username, setUsername] = useState(initialName)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    try {
      const name = username.trim()
      await saveUsername(name)
      setUsername(name)
      setMessage(name ? 'Username saved.' : 'Username removed.')
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return <section className="report settings">
    <h1>Profile</h1>
    <div className="profile">
      {image
        ? <img className="avatar profile-photo" src={image} alt="Your profile photo" referrerPolicy="no-referrer" />
        : <span className="avatar profile-photo" aria-hidden="true">{initialName[0]?.toUpperCase() ?? '•'}</span>}
      <label>Change profile picture<input type="file" disabled={busy} accept="image/jpeg,image/png,image/webp" onChange={async event => {
        const file = event.currentTarget.files?.[0]
        if (!file) return
        event.currentTarget.value = ''
        setBusy(true)
        try {
          setImage(await uploadAvatar(file, user))
          setMessage('Profile picture updated.')
        } catch (error) {
          setMessage((error as Error).message)
        } finally {
          setBusy(false)
        }
      }} /></label>
    </div>
    <form onSubmit={save}>
      <label>Username<input value={username} maxLength={30} autoComplete="off"
        aria-describedby="username-help" onChange={event => setUsername(event.target.value)} /></label>
      <p className="split" id="username-help">Only shown here. Up to 30 characters.</p>
      <button className="primary" disabled={busy || username.trim() === initialName}>Save username</button>
    </form>
    <p role="status">{message}</p>
    <div className="profile">
      <h2>Account recovery</h2>
      <p>Sign-in and recovery use your Google account{user.email ? ` (${user.email})` : ''}.</p>
      <RecoveryLink />
    </div>
    <button className="quiet" disabled={busy} onClick={() => void signOut()}>Sign out</button>
  </section>
}
