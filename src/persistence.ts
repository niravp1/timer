import { type Batch, type Remote, mergeInitial, readRemote, writeRemote } from './cloud'
import { type Tracker, defaults, recover } from './engine'

export type Journal = {
  state: Tracker; revision: number; dirty: string[]; eventOffset: number; pending?: Batch
}

export function hydrate(cached: Journal | undefined, remote: Remote, zone: string) {
  if (cached && (cached.dirty.length || cached.state.events.length > cached.eventOffset || cached.pending)) return cached
  if (cached && cached.revision === remote.revision) return cached
  const state = mergeInitial(remote, defaults(zone))
  return { state, revision: remote.revision, dirty: [], eventOffset: state.events.length }
}

export function reconcileJournal(local: Journal, remote: Remote): Journal | undefined {
  const latest = remote.state
  if (!latest) return undefined

  const knownEvents = new Set(latest.events.map(event => event.id))
  const unsent = local.state.events.slice(local.eventOffset).filter(event => !knownEvents.has(event.id))
  const cloudIds = new Set(latest.blocks.map(block => block.id))
  const dirtyIds = new Set(local.dirty)
  if (unsent.some(event => event.blockId && cloudIds.has(event.blockId) && dirtyIds.has(event.blockId))) {
    return undefined
  }

  const additions = local.state.blocks.filter(block => dirtyIds.has(block.id) && !cloudIds.has(block.id))
  const blocks = [...latest.blocks, ...additions].sort((a, b) => a.start - b.start)
  if (blocks.some((block, index) => index > 0 && (blocks[index - 1].end ?? Infinity) > block.start)) {
    return undefined
  }

  const updatedSettings = unsent.some(event => event.type === 'settings_changed')
  const acknowledged = new Set(local.state.events.slice(0, local.eventOffset).map(event => event.id))
  if (updatedSettings && latest.events.some(event => event.type === 'settings_changed' && !acknowledged.has(event.id))) {
    return undefined
  }
  const active = blocks.at(-1)
  const checkpoint = active && active.end === undefined
    ? (cloudIds.has(active.id) ? latest.checkpoint : local.state.checkpoint)
    : Math.max(latest.checkpoint, local.state.checkpoint)
  return {
    state: {
      settings: updatedSettings ? local.state.settings : latest.settings,
      blocks, events: [...latest.events, ...unsent], checkpoint,
    },
    revision: remote.revision,
    dirty: additions.map(block => block.id),
    eventOffset: latest.events.length,
  }
}

export class Persistence {
  journal: Journal
  busy = false
  status: 'saved' | 'pending' | 'conflict' | 'unavailable' = 'saved'
  constructor(
    private key: string, journal: Journal, private offlineDemo: boolean,
    private notify: () => void, private send = writeRemote, private load = readRemote,
  ) { this.journal = journal }

  save(state: Tracker, checkpointOnly = false) {
    const previous = this.journal.state
    const dirty = new Set(this.journal.dirty)
    if (!checkpointOnly) {
      state.blocks.forEach((block, index) => {
        if (block !== previous.blocks[index]) dirty.add(block.id)
      })
    }
    this.journal = { ...this.journal, state, dirty: [...dirty] }
    const saved = this.store()
    if (!checkpointOnly) void this.flush()
    return saved
  }

  private store() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.journal))
      return true
    } catch {
      this.status = 'unavailable'
      this.notify()
      return false
    }
  }

  async restoreCloud() {
    const remote = await this.load()
    const previous = this.journal
    const state = mergeInitial(remote, previous.state.settings)
    // Keep the browser copy recoverable even if a file download is blocked.
    localStorage.setItem(`${this.key}:sync-backup`, JSON.stringify(previous))
    this.journal = { state, revision: remote.revision, dirty: [], eventOffset: state.events.length }
    this.status = 'saved'
    this.save(recover(state, Date.now(), crypto.randomUUID()))
  }

  async flush() {
    if (this.offlineDemo || this.busy || this.status === 'conflict') return
    const { state, dirty, eventOffset, revision, pending } = this.journal
    if (!pending && !dirty.length && eventOffset === state.events.length) return
    const batch = pending ?? {
      id: crypto.randomUUID(), revision, settings: state.settings, checkpoint: state.checkpoint,
      blocks: state.blocks.filter(block => dirty.includes(block.id)), events: state.events.slice(eventOffset),
    }
    this.journal = { ...this.journal, pending: batch }
    this.busy = true
    this.status = 'pending'
    this.store()
    this.notify()
    let acknowledged = false
    try {
      const nextRevision = await this.send(batch)
      const latest = this.journal
      const sent = new Map(batch.blocks.map(block => [block.id, block]))
      const remaining = latest.dirty.filter(id => {
        const current = latest.state.blocks.find(block => block.id === id)
        return !sent.has(id) || JSON.stringify(sent.get(id)) !== JSON.stringify(current)
      })
      this.journal = { state: latest.state, revision: nextRevision, dirty: remaining, eventOffset: eventOffset + batch.events.length }
      this.status = 'saved'
      this.store()
      acknowledged = true
    } catch (error) {
      const failure = error as { code?: string; message?: string }
      if (failure.code === 'PT409' || failure.code === '40001' || failure.message === 'Tracker revision changed') {
        try {
          const latest = await this.load()
          const reconciled = latest.revision > revision ? reconcileJournal(this.journal, latest) : undefined
          if (reconciled) {
            this.journal = reconciled
            this.status = 'saved'
            this.store()
            acknowledged = true
          } else {
            this.status = 'conflict'
          }
        } catch {
          // Keep the queued batch intact while the cloud read is unavailable.
        }
      }
    } finally {
      this.busy = false
      this.notify()
    }
    if (acknowledged) void this.flush()
  }
}
