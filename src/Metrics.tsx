import { useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import { span, total, type Cycle, type Tracker } from './engine'
import { report, weekOf } from './report'
import { duration } from './time'

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const dayLabel = (day: Temporal.PlainDate) => day.toLocaleString(undefined, { month: 'short', day: 'numeric' })

function Totals({ focus, rest, extra }: { focus: number; rest: number; extra: number }) {
  return <dl className="totals">
    <div><dt>Focused</dt><dd>{duration(focus)}</dd></div>
    <div><dt>Break time</dt><dd>{duration(rest)}</dd></div>
    <div><dt>Extra time</dt><dd>{duration(extra)}</dd></div>
  </dl>
}

export function Metrics({ state, at }: { state: Tracker; at: number }) {
  const [week, setWeek] = useState(() => weekOf(at, state.settings.zone))
  const [day, setDay] = useState<Temporal.PlainDate>()
  const [selected, setSelected] = useState<string>()
  const days = weekdays.map((_, index) => week.add({ days: index }))
  const reports = days.map(date => report(state, date, at))
  const maximum = Math.max(1, ...reports.map(result => result.extra))
  const daily = day ? report(state, day, at) : undefined
  const cycle = daily?.entries.find(entry => entry.id === selected)
  const formatter = new Intl.DateTimeFormat(undefined, {
    timeZone: state.settings.zone, hour: 'numeric', minute: '2-digit', second: '2-digit',
  })
  const clock = (ms: number) => formatter.format(ms)
  const range = (start: number, end?: number) => `${clock(start)} – ${end === undefined ? 'In progress' : clock(end)}`
  const names = { focus: 'Focus', manual_pause: 'Manual pause', system_interruption: 'System interruption' }

  if (cycle) return <section className="report">
    <button className="quiet" onClick={() => setSelected(undefined)}>← Day</button>
    <h1>Session</h1>
    <p>{range(cycle.start, cycle.end)}</p>
    <p>{cycle.status.replace('_', ' ')}{cycle.reason ? ` · ${cycle.reason.replace('_', ' ')}` : ''}</p>
    <dl className="details">
      <div><dt>Wall-clock span</dt><dd>{duration(span(cycle, at))}</dd></div>
      <div><dt>Focus target</dt><dd>{duration(cycle.target)}</dd></div>
      {Object.entries(names).map(([kind, label]) => <div key={kind}>
        <dt>{label}</dt><dd>{duration(total(cycle, kind as keyof typeof names, at))}</dd>
      </div>)}
    </dl>
    <div className="timeline" aria-hidden="true">{cycle.intervals.map(interval => <span key={interval.id} className={interval.kind} style={{ flexGrow: span(interval, at) }} />)}</div>
    <ol className="intervals">{cycle.intervals.map(interval => <li key={interval.id}>
      <span>{names[interval.kind]}{interval.quality === 'inferred' && ' (estimated start)'}</span>
      <span>{range(interval.start, interval.end)}</span>
    </li>)}</ol>
    {cycle.rest && <>
      <h2>Break</h2>
      <p>{range(cycle.rest.start, cycle.rest.end)}{cycle.rest.reason && ` · ${cycle.rest.reason.replace('_', ' ')}`}</p>
      <dl className="details">
        <div><dt>Elapsed</dt><dd>{duration(span(cycle.rest, at))}</dd></div>
        <div><dt>Allowance</dt><dd>{duration(cycle.rest.allowance)}</dd></div>
        <div><dt>Included</dt><dd>{duration(Math.min(cycle.rest.allowance, span(cycle.rest, at)))}</dd></div>
        <div><dt>Extra</dt><dd>{duration(Math.max(0, span(cycle.rest, at) - cycle.rest.allowance))}</dd></div>
      </dl>
    </>}
  </section>

  function entry(cycle: Cycle) {
    const paused = total(cycle, 'manual_pause', at)
    return <button className="entry" key={cycle.id} onClick={() => setSelected(cycle.id)}>
      <span><strong>{range(cycle.start, cycle.end)}</strong><small>{duration(total(cycle, 'focus', at))} focused · {duration(paused)} paused</small></span>
      {cycle.rest && <span><small>{range(cycle.rest.start, cycle.rest.end)}</small><small>{duration(span(cycle.rest, at))} break · {duration(Math.max(0, span(cycle.rest, at) - cycle.rest.allowance))} extra</small></span>}
    </button>
  }

  if (day && daily) return <section className="report">
    <button className="quiet" onClick={() => setDay(undefined)}>← Week</button>
    <h1>{day.toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h1>
    <Totals {...daily} />
    <p className="split">{duration(daily.pauses)} in manual pauses · {duration(daily.overage)} in extended breaks</p>
    <h2>Activity</h2>
    {daily.entries.length ? daily.entries.map(entry) : <p>No activity for this day.</p>}
  </section>

  return <section className="report">
    <div className="report-heading">
      <div><h1>Your Week</h1><p>{dayLabel(days[0])} – {dayLabel(days[6])}, {days[6].year}</p></div>
      <div className="week-nav">
        <button className="quiet" aria-label="Previous week" onClick={() => setWeek(week.subtract({ weeks: 1 }))}>←</button>
        <button className="quiet" aria-label="Next week" onClick={() => setWeek(week.add({ weeks: 1 }))}>→</button>
      </div>
    </div>
    <Totals focus={reports.reduce((sum, item) => sum + item.focus, 0)}
      rest={reports.reduce((sum, item) => sum + item.rest, 0)}
      extra={reports.reduce((sum, item) => sum + item.extra, 0)} />
    <h2>Extra time by day</h2>
    <div className="chart">{reports.map((item, index) => <button
      key={weekdays[index]} aria-label={`${weekdays[index]}, ${dayLabel(days[index])}, ${duration(item.extra)} extra`}
      onClick={() => setDay(days[index])}>
      <span>{duration(item.extra)}</span>
      <span className="bar-track"><span className="bar" style={{ height: `${100 * item.extra / maximum}%` }} /></span>
      <span>{weekdays[index]}</span>
    </button>)}</div>
  </section>
}
