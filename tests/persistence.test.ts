import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Batch, Remote } from '../src/cloud'
import { defaults, initial, transition } from '../src/engine'
import { hydrate, Persistence } from '../src/persistence'

const users = Array.from({ length: 4 }, () => crypto.randomUUID())
const settings = defaults('UTC')
const at = Date.parse('2026-11-09T10:00:00Z')
let db: PGlite

async function asUser(user: string) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user])
  await db.exec('set role authenticated')
}

async function write(batch: Batch) {
  const { rows } = await db.query<{ revision: number }>('select public.write_tracker($1::jsonb) as revision', [batch])
  return Number(rows[0].revision)
}

async function read() {
  const { rows } = await db.query<{ remote: Remote }>('select public.read_tracker() as remote')
  return rows[0].remote
}

beforeAll(async () => {
  db = new PGlite()
  // Model Supabase's roles, auth.uid(), and Storage tables, then run the actual migration.
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema storage;
    grant usage on schema auth, storage to anon, authenticated;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit integer, allowed_mime_types text[]);
    create table storage.objects(bucket_id text, name text, primary key(bucket_id, name));
    alter table storage.objects enable row level security;
    grant select, insert, update on storage.objects to authenticated;
  `)
  for (const user of users) await db.query('insert into auth.users values ($1)', [user])
  for (const migration of ['202611110001_focus_tracker.sql', '202611110002_tracker_revision_http_conflict.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'))
  }
})

afterAll(async () => { await db?.close(); vi.unstubAllGlobals() })

describe('cloud persistence and account isolation', () => {
  it('atomically commits, acknowledges replay, and rejects stale or malformed writes', async () => {
    await asUser(users[0])
    const running = transition(initial(settings), { type: 'start', at, id: crypto.randomUUID() })
    const batch = { id: crypto.randomUUID(), revision: 0, settings, checkpoint: at, blocks: running.blocks, events: running.events }
    expect(await write(batch)).toBe(1)
    expect(await write(batch)).toBe(1)
    await expect(write({ ...batch, id: crypto.randomUUID() })).rejects.toMatchObject({ code: 'PT409' })
    const closed = transition(running, { type: 'end_session', at: at + 1000, id: crypto.randomUUID() })
    const second = transition(closed, { type: 'start', at: at + 2000, id: crypto.randomUUID() })
    const malformed = structuredClone(second.blocks)
    malformed[1].cycles[0].intervals[0].start -= 1
    const next = { ...batch, id: crypto.randomUUID(), revision: 1, checkpoint: second.checkpoint,
      blocks: second.blocks, events: second.events.slice(1) }
    await expect(write({ ...next, blocks: malformed })).rejects.toThrow('Invalid or overlapping')
    expect((await read()).revision).toBe(1)
    expect(await write(next)).toBe(2)
    expect(await read()).toMatchObject({ revision: 2, state: second })
  })

  it('isolates activity, settings, profiles, and avatar objects between users', async () => {
    await asUser(users[0])
    const path = `${users[0]}/avatar`
    await db.query('select public.set_tracker_avatar($1)', [path])
    await db.query("insert into storage.objects values ('avatars', $1)", [path])
    expect((await read()).avatar).toBe(path)
    await asUser(users[1])
    expect(await read()).toEqual({ avatar: null, revision: 0, state: null })
    for (const table of ['tracker_profiles', 'tracker_accounts', 'work_blocks', 'activity_events', 'tracker_receipts']) {
      expect((await db.query(`select * from public.${table} where user_id = $1`, [users[0]])).rows).toEqual([])
    }
    expect((await db.query('select * from storage.objects')).rows).toEqual([])
    expect((await db.query('update storage.objects set name = $1 where name = $2 returning name', [`${users[1]}/avatar`, path])).rows).toEqual([])
    await expect(db.query("insert into storage.objects values ('avatars', $1)", [path])).rejects.toMatchObject({ code: '42501' })
    await expect(db.query('select public.set_tracker_avatar($1)', [path])).rejects.toMatchObject({ code: '42501' })
    await expect(db.query('update public.work_blocks set body = $1 where user_id = $2', [{}, users[0]]))
      .rejects.toMatchObject({ code: '42501' })
    await db.exec('reset role; set role anon')
    await expect(read()).rejects.toMatchObject({ code: '42501' })
  })

  it('recovers a pending client batch after a lost response, then syncs newer changes', async () => {
    await asUser(users[2])
    const local = new Map<string, string>()
    vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => local.set(key, value) })
    const remote = await read()
    const store = new Persistence('tracker', hydrate(undefined, remote, 'UTC'), false, () => {}, async batch => {
      await write(batch)
      throw new Error('Response lost')
    })
    const running = transition(store.journal.state, { type: 'start', at, id: crypto.randomUUID() })
    store.save(running)
    await vi.waitFor(() => expect(store.busy).toBe(false))
    expect(store.status).toBe('pending')
    expect((await read()).revision).toBe(1)
    const paused = transition(running, { type: 'pause', at: at + 1000, id: crypto.randomUUID() })
    store.save(paused)
    await vi.waitFor(() => expect(store.busy).toBe(false))
    const reopened = new Persistence('tracker', hydrate(JSON.parse(local.get('tracker')!), await read(), 'UTC'), false, () => {}, write)
    await reopened.flush()
    await vi.waitFor(() => expect(reopened.status).toBe('saved'))
    expect(reopened.journal.revision).toBe(2)
    expect((await read()).state).toEqual(paused)
    expect(hydrate(undefined, await read(), 'UTC').state).toEqual(paused)
  })

  it('syncs a disjoint local session after the cloud revision advances', async () => {
    await asUser(users[1])
    vi.stubGlobal('localStorage', { setItem: vi.fn() })
    const stale = await read()
    const createSession = (start: number) => {
      const running = transition(initial(settings), { type: 'start', at: start, id: crypto.randomUUID() })
      return transition(running, { type: 'end_session', at: start + 1000, id: crypto.randomUUID() })
    }
    const cloudSession = createSession(at)
    await write({ id: crypto.randomUUID(), revision: stale.revision, settings, checkpoint: cloudSession.checkpoint,
      blocks: cloudSession.blocks, events: cloudSession.events })

    const store = new Persistence('tracker', hydrate(undefined, stale, 'UTC'), false, () => {}, write, read)
    const localSession = createSession(at + 3000)
    store.save(localSession)
    await vi.waitFor(() => expect(store.journal.revision).toBe(stale.revision + 2))
    expect((await read()).state?.blocks.map(block => block.id)).toEqual([
      cloudSession.blocks[0].id, localSession.blocks[0].id,
    ])
  })

  it('preserves an overlapping local session for backup rather than replacing cloud activity', async () => {
    await asUser(users[3])
    const running = transition(initial(settings), { type: 'start', at, id: crypto.randomUUID() })
    const cloudSession = transition(running, { type: 'end_session', at: at + 1000, id: crypto.randomUUID() })
    await write({ id: crypto.randomUUID(), revision: 0, settings, checkpoint: cloudSession.checkpoint,
      blocks: cloudSession.blocks, events: cloudSession.events })
    const cache = new Map<string, string>()
    vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => cache.set(key, value) })
    const stale = hydrate(undefined, { revision: 0, state: null, avatar: null }, 'UTC')
    const local = transition(stale.state, { type: 'start', at, id: crypto.randomUUID() })
    const store = new Persistence('tracker', stale, false, () => {}, write, read)
    store.save(local)
    await vi.waitFor(() => expect(store.status).toBe('conflict'))
    expect(store.journal.state).toEqual(local)
    const cloudBefore = await read()
    await store.restoreCloud()
    expect(store.journal.state).toEqual(cloudBefore.state)
    expect(JSON.parse(cache.get('tracker:sync-backup')!).state).toEqual(local)
    expect(await read()).toEqual(cloudBefore)
  })

})
