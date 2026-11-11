import { type Batch, type Remote, mergeInitial, writeRemote } from './cloud'
import { type Tracker, defaults } from './engine'

export type Journal = {
  state: Tracker; revision: number; dirty: string[]; eventOffset: number; pending?: Batch
}

export function hydrate(cached: Journal | undefined, remote: Remote, zone: string) {
  if (cached && (cached.dirty.length || cached.state.events.length > cached.eventOffset || cached.pending)) return cached
  if (cached && cached.revision === remote.revision) return cached
  const state = mergeInitial(remote, defaults(zone))
  return { state, revision: remote.revision, dirty: [], eventOffset: state.events.length }
}

export class Persistence {
  journal: Journal
  busy = false
  status: 'saved' | 'pending' | 'conflict' | 'unavailable' = 'saved'
  constructor(
    private key: string, journal: Journal, private offlineDemo: boolean,
    private notify: () => void, private send = writeRemote,
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
      if ((error as { code?: string }).code === '40001') this.status = 'conflict'
    } finally {
      this.busy = false
      this.notify()
    }
    if (acknowledged) void this.flush()
  }
}
