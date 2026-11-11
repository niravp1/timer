import { useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import { span, total, type Cycle, type Tracker } from './engine'
import { report, weekOf } from './report'
import { breakClockText, duration } from './time'

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const dayLabel = (day: Temporal.PlainDate) => day.toLocaleString(undefined, { month: 'short', day: 'numeric' })

function Totals({ focus, included, overage }: { focus: number; included: number; overage: number }) {
  return <dl className="totals">
    <div><dt>Focused</dt><dd>{duration(focus)}</dd></div>
    <div><dt>Break time</dt><dd>{duration(included)}</dd></div>
    <div><dt>Extra time</dt><dd>{duration(overage)}</dd></div>
  </dl>
}

export function Metrics({ state, at }: { state: Tracker; at: number }) {
  const [week, setWeek] = useState(() => weekOf(at, state.settings.zone))
  const [day, setDay] = useState<Temporal.PlainDate>()
  const [selected, setSelected] = useState<string>()
  const days = weekdays.map((_, index) => week.add({ days: index }))
  const reports = days.map(date => report(state, date, at))
  const maximum = Math.max(1, ...reports.map(({ focus, included, overage }) => focus + included + overage))
  const daily = day ? report(state, day, at) : undefined
  const cycle = daily?.entries.find(entry => entry.id === selected)
  const formatter = new Intl.DateTimeFormat(undefined, {
    timeZone: state.settings.zone, hour: 'numeric', minute: '2-digit', second: '2-digit',
  })
  const shortClock = new Intl.DateTimeFormat(undefined, { timeZone: state.settings.zone, hour: 'numeric', minute: '2-digit' })
  const clock = (ms: number) => formatter.format(ms)
  const activityTime = (start: number, end?: number) => {
    const label = shortClock.format(start)
    if (end === undefined) return `${label} · In progress`
    const endLabel = shortClock.format(end)
    return label === endLabel ? label : `${label} – ${endLabel}`
  }
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
    const rest = cycle.rest
    const breakTime = rest ? span(rest, at) : 0
    const overage = rest ? Math.max(0, breakTime - rest.allowance) : 0
    return <li key={cycle.id}>
      <button className="entry" onClick={() => setSelected(cycle.id)}>
        <span className="entry-content">
          <span className="entry-line">
            <span><strong>Focus session</strong><small>{activityTime(cycle.start, cycle.end)}</small></span>
            <span><strong>{duration(total(cycle, 'focus', at))} focused</strong>{paused > 0 && <small>{duration(paused)} paused</small>}</span>
          </span>
          {rest && <span className="entry-line">
            <span>Break<small>{activityTime(rest.start, rest.end)}</small></span>
            <span>{duration(breakTime)}{overage > 0 && <small>{duration(overage)} over allowance</small>}</span>
          </span>}
        </span>
        <span className="entry-arrow" aria-hidden="true">›</span>
      </button>
    </li>
  }

  if (day && daily) return <section className="report">
    <button className="quiet" onClick={() => setDay(undefined)}>← Week</button>
    <h1>{day.toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h1>
    <Totals {...daily} />
    <p className="split">Break time includes the portion within each break’s allowance. Extra time is the portion after it.</p>
    <h2>Activity</h2>
    {daily.entries.length ? <ul className="activity-list">{daily.entries.map(entry)}</ul> : <p>No activity for this day.</p>}
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
      included={reports.reduce((sum, item) => sum + item.included, 0)}
      overage={reports.reduce((sum, item) => sum + item.overage, 0)} />
    <h2>Time breakdown by day</h2>
    <ul className="chart-legend">
      <li><span className="chart-included" />Focus + included breaks</li>
      <li><span className="chart-extra" />Extra break time</li>
    </ul>
    <div className="chart">{reports.map(({ focus, included, overage }, index) => {
      const covered = focus + included
      const tracked = covered + overage
      const tooltipId = `day-breakdown-${index}`
      return <div className="chart-day" key={weekdays[index]}>
        <button aria-describedby={tooltipId}
          aria-label={`${weekdays[index]}, ${dayLabel(days[index])}, ${duration(covered)} focus and included breaks, ${duration(overage)} extra break time`}
          onClick={() => setDay(days[index])}>
          <span>{duration(tracked)}</span>
          <span className="bar-track" aria-hidden="true">
            <span className="bar" style={{ height: `${100 * tracked / maximum}%` }}>
              <span className="chart-extra" style={{ flexGrow: overage }} />
              <span className="chart-included" style={{ flexGrow: covered }} />
            </span>
          </span>
          <span>{weekdays[index]}</span>
        </button>
        <div className="chart-tooltip" role="tooltip" id={tooltipId}>
          <span>Focused <strong>{breakClockText(focus)}</strong></span>
          <span>Included break <strong>{breakClockText(included)}</strong></span>
          <span>Extra break <strong>{breakClockText(overage)}</strong></span>
        </div>
      </div>
    })}</div>
  </section>
}
