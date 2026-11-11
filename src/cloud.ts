import { createClient, type User } from '@supabase/supabase-js'
import { initial, type ActivityEvent, type Block, type Tracker } from './engine'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const cloud = url && key ? createClient(url, key) : undefined
export const demo = import.meta.env.DEV && !cloud
export const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export type Remote = { revision: number; state: Tracker | null; avatar: string | null }
export type Batch = {
  id: string; revision: number; settings: Tracker['settings']; checkpoint: number
  blocks: Block[]; events: ActivityEvent[]
}

export async function readRemote(): Promise<Remote> {
  const { data, error } = await cloud!.rpc('read_tracker')
  if (error) throw error
  return data
}

export async function writeRemote(batch: Batch): Promise<number> {
  const { data, error } = await cloud!.rpc('write_tracker', { batch })
  if (error) throw error
  return data
}

export function mergeInitial(remote: Remote, settings: Tracker['settings']) {
  return remote.state ?? initial(settings)
}

export async function avatarUrl(path: string | null, user: User | null) {
  if (!path) return user?.user_metadata.avatar_url as string | undefined
  const { data, error } = await cloud!.storage.from('avatars').createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}

export async function uploadAvatar(file: File, user: User) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(file.type) || file.size > 2_000_000) throw new Error('Choose a JPEG, PNG, or WebP under 2 MB.')
  const path = `${user.id}/avatar`
  const { error } = await cloud!.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  const { error: profileError } = await cloud!.rpc('set_tracker_avatar', { object_path: path })
  if (profileError) throw profileError
  return avatarUrl(path, user)
}
