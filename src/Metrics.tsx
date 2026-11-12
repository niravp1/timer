import { useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import { span, total, type Cycle, type Tracker } from './engine'
import { report, weekOf } from './report'
import { durationClockText, duration } from './time'

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const dayLabel = (day: Temporal.PlainDate) => day.toLocaleString(undefined, { month: 'short', day: 'numeric' })

function Totals({ focus, included, extra }: { focus: number; included: number; extra: number }) {
  return <dl className="totals">
    <div><dt>Focused</dt><dd>{duration(focus)}</dd></div>
    <div><dt>Break time</dt><dd>{duration(included)}</dd></div>
    <div><dt>Extra time</dt><dd>{duration(extra)}</dd></div>
  </dl>
}

export function Metrics({ state, at }: { state: Tracker; at: number }) {
  const [week, setWeek] = useState(() => weekOf(at, state.settings.zone))
  const [day, setDay] = useState<Temporal.PlainDate>()
  const [selected, setSelected] = useState<string>()
  const days = weekdays.map((_, index) => week.add({ days: index }))
  const reports = days.map(date => report(state, date, at))
  const maximum = Math.max(1, ...reports.map(({ focus, included, extra }) => focus + included + extra))
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

  if (cycle) {
    const focused = total(cycle, 'focus', at)
    const paused = total(cycle, 'manual_pause', at)
    const away = total(cycle, 'system_interruption', at)
    const rest = cycle.rest
    const elapsed = rest ? span(rest, at) : 0
    const included = rest ? Math.min(rest.allowance, elapsed) : 0
    const overage = elapsed - included
    const status = cycle.status === 'completed' ? 'Focus goal reached'
      : cycle.reason === 'daily_cutoff' ? 'Ended at daily cutoff'
      : cycle.status === 'ended_early' ? 'Ended early'
      : cycle.status === 'paused' ? 'Paused' : 'In progress'

    return <section className="report session-report">
      <button className="quiet" onClick={() => setSelected(undefined)}>← Day</button>
      <h1>Focus session</h1>
      <p className="session-meta">{range(cycle.start, cycle.end)} · {status}</p>
      <Totals focus={focused} included={included} extra={paused + overage} />

      <h2>Session timeline</h2>
      <div className="timeline" aria-hidden="true">
        {cycle.intervals.map(interval => <span key={interval.id} className={interval.kind} style={{ flexGrow: span(interval, at) }} />)}
        {included > 0 && <span className="included_break" style={{ flexGrow: included }} />}
        {overage > 0 && <span className="manual_pause" style={{ flexGrow: overage }} />}
      </div>
      <ul className="session-legend">
        <li className="focus">Focused</li>
        {paused + overage > 0 && <li className="manual_pause">Extra time</li>}
        {away > 0 && <li className="system_interruption">Away</li>}
        {included > 0 && <li className="included_break">Included break</li>}
      </ul>
      <ol className="intervals">
        {cycle.intervals.map(interval => <li key={interval.id} className={interval.kind}>
          <span><strong>{names[interval.kind]}</strong><small>{range(interval.start, interval.end)}{interval.quality === 'inferred' && ' · Estimated start'}</small></span>
          <span>{duration(span(interval, at))}</span>
        </li>)}
        {rest && <li className={overage > 0 ? 'manual_pause' : 'included_break'}>
          <span><strong>Break</strong><small>{range(rest.start, rest.end)}</small></span>
          <span>{duration(elapsed)}</span>
        </li>}
      </ol>
      <dl className="details session-notes">
        <div><dt>Focus goal</dt><dd>{duration(cycle.target)}</dd></div>
        <div><dt>Elapsed focus session</dt><dd>{duration(span(cycle, at))}</dd></div>
        {rest && <div><dt>Break allowance</dt><dd>{duration(rest.allowance)}</dd></div>}
        {paused > 0 && <div><dt>Extra from manual pauses</dt><dd>{duration(paused)}</dd></div>}
        {overage > 0 && <div><dt>Extra from break overage</dt><dd>{duration(overage)}</dd></div>}
      </dl>
    </section>
  }

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
    <p className="split">Break time counts up to your allowance. Extra time includes manual pauses and break time past the allowance.</p>
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
      extra={reports.reduce((sum, item) => sum + item.extra, 0)} />
    <h2>Time breakdown by day</h2>
    <ul className="chart-legend">
      <li><span className="chart-included" />Focus + included breaks</li>
      <li><span className="chart-extra" />Extra time</li>
    </ul>
    <div className="chart">{reports.map(({ focus, included, pauses, overage, extra }, index) => {
      const covered = focus + included
      const tracked = covered + extra
      const tooltipId = `day-breakdown-${index}`
      return <div className="chart-day" key={weekdays[index]}>
        <button aria-describedby={tooltipId}
          aria-label={`${weekdays[index]}, ${dayLabel(days[index])}, ${duration(covered)} focus and included breaks, ${duration(extra)} extra time`}
          onClick={() => setDay(days[index])}>
          <span>{duration(tracked)}</span>
          <span className="bar-track" aria-hidden="true">
            <span className="bar" style={{ height: `${100 * tracked / maximum}%` }}>
              <span className="chart-extra" style={{ flexGrow: extra }} />
              <span className="chart-included" style={{ flexGrow: covered }} />
            </span>
          </span>
          <span>{weekdays[index]}</span>
        </button>
        <div className="chart-tooltip" role="tooltip" id={tooltipId}>
          <span>Focused <strong>{durationClockText(focus)}</strong></span>
          <span>Included break <strong>{durationClockText(included)}</strong></span>
          <span>Manual pauses <strong>{durationClockText(pauses)}</strong></span>
          <span>Extra break <strong>{durationClockText(overage)}</strong></span>
        </div>
      </div>
    })}</div>
  </section>
}
