import { Fragment, useState } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import { span, total, type Cycle, type Tracker } from './engine'
import { breakAllowances, report, weekOf } from './report'
import { durationClockText, preciseDuration } from './time'

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const dayLabel = (day: Temporal.PlainDate) => day.toLocaleString(undefined, { month: 'short', day: 'numeric' })

function Totals({ focus, included, extra }: { focus: number; included: number; extra: number }) {
  return <dl className="totals">
    <div><dt>Focused</dt><dd>{preciseDuration(focus)}</dd></div>
    <div><dt>Break time</dt><dd>{preciseDuration(included)}</dd></div>
    <div><dt>Extra time</dt><dd>{preciseDuration(extra)}</dd></div>
  </dl>
}

function TrackedTotals({ focus, included, extra, tracked }: {
  focus: number; included: number; extra: number; tracked: number
}) {
  return <>
    <Totals focus={focus} included={included} extra={extra} />
    <dl className="details time-accounting">
      <div><dt>Total tracked time</dt><dd>{preciseDuration(tracked)}</dd></div>
    </dl>
  </>
}

export function Metrics({ state, at }: { state: Tracker; at: number }) {
  const [week, setWeek] = useState(() => weekOf(at, state.settings.zone))
  const [day, setDay] = useState<Temporal.PlainDate>()
  const [selected, setSelected] = useState<string>()
  const days = weekdays.map((_, index) => week.add({ days: index }))
  const reports = days.map(date => report(state, date, at))
  const maximum = Math.max(1, ...reports.map(({ tracked }) => tracked))
  const weekly = reports.reduce((sum, item) => ({
    focus: sum.focus + item.focus,
    included: sum.included + item.included,
    extra: sum.extra + item.extra,
    tracked: sum.tracked + item.tracked,
  }), { focus: 0, included: 0, extra: 0, tracked: 0 })
  const daily = day ? report(state, day, at) : undefined
  const cycle = daily?.entries.find(entry => entry.cycle.id === selected)?.cycle
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
  const pauseStatus = (cycle: Cycle) => {
    const interval = cycle.intervals.at(-1)
    if (!interval) return 'Paused'
    const label = interval.kind === 'system_interruption' ? 'Away' : 'Paused'
    return `${label} since ${shortClock.format(interval.start)}`
  }
  const names = { focus: 'Focus', manual_pause: 'Manual pause', system_interruption: 'Paused while away' }

  if (cycle) {
    const focused = total(cycle, 'focus', at)
    const paused = total(cycle, 'manual_pause', at)
    const away = total(cycle, 'system_interruption', at)
    const rest = cycle.rest
    const elapsed = rest ? span(rest, at) : 0
    const allowances = breakAllowances(state)
    const allowed = rest ? allowances.get(rest.id) ?? 0 : 0
    const included = Math.min(allowed, elapsed)
    const pauseIncluded = cycle.intervals.reduce((sum, interval) => interval.kind !== 'focus'
      ? sum + Math.min(span(interval, at), allowances.get(interval.id) ?? 0) : sum, 0)
    const pauseExtra = paused + away - pauseIncluded
    const overage = elapsed - included
    const status = cycle.status === 'completed' ? 'Focus goal reached'
      : cycle.reason === 'daily_cutoff' ? 'Ended at daily cutoff'
      : cycle.status === 'ended_early' ? 'Ended early'
      : cycle.status === 'paused' ? pauseStatus(cycle) : 'In progress'

    return <section className="report session-report">
      <button className="quiet" onClick={() => setSelected(undefined)}>← Day</button>
      <h1>Focus session</h1>
      <p className="session-meta">{range(cycle.start, cycle.end)} · {status}</p>
      <Totals focus={focused} included={included + pauseIncluded} extra={pauseExtra + overage} />

      <h2>Session timeline</h2>
      <div className="timeline" aria-hidden="true">
        {cycle.intervals.map(interval => {
          const elapsed = span(interval, at)
          if (interval.kind === 'focus') return <span key={interval.id} className={interval.kind} style={{ flexGrow: elapsed }} />
          const covered = Math.min(elapsed, allowances.get(interval.id) ?? 0)
          return <Fragment key={interval.id}>
            {covered > 0 && <span className="included_break" style={{ flexGrow: covered }} />}
            {elapsed > covered && <span className="manual_pause" style={{ flexGrow: elapsed - covered }} />}
          </Fragment>
        })}
        {included > 0 && <span className="included_break" style={{ flexGrow: included }} />}
        {overage > 0 && <span className="manual_pause" style={{ flexGrow: overage }} />}
      </div>
      <ul className="session-legend">
        <li className="focus">Focused</li>
        {pauseExtra + overage > 0 && <li className="manual_pause">Extra time</li>}
        {included + pauseIncluded > 0 && <li className="included_break">Included break</li>}
      </ul>
      <ol className="intervals">
        {cycle.intervals.map(interval => <li key={interval.id} className={interval.kind}>
          <span><strong>{names[interval.kind]}</strong><small>{range(interval.start, interval.end)}{interval.quality === 'inferred' && ' · Estimated start'}</small></span>
          <span>{preciseDuration(span(interval, at))}</span>
        </li>)}
        {rest && <li className={overage > 0 ? 'manual_pause' : 'included_break'}>
          <span><strong>Break</strong><small>{range(rest.start, rest.end)}</small></span>
          <span>{preciseDuration(elapsed)}</span>
        </li>}
      </ol>
      <dl className="details session-notes">
        <div><dt>Focus goal</dt><dd>{preciseDuration(cycle.target)}</dd></div>
        <div><dt>Session span{away > 0 && ' (includes away)'}</dt><dd>{preciseDuration(span(cycle, at))}</dd></div>
        {rest && <div><dt>Break allowance</dt><dd>{preciseDuration(allowed)}</dd></div>}
        {pauseIncluded > 0 && <div><dt>Break time from pauses</dt><dd>{preciseDuration(pauseIncluded)}</dd></div>}
        {pauseExtra > 0 && <div><dt>Extra from pauses</dt><dd>{preciseDuration(pauseExtra)}</dd></div>}
        {overage > 0 && <div><dt>Extra from break overage</dt><dd>{preciseDuration(overage)}</dd></div>}
      </dl>
    </section>
  }

  function entry({ cycle, focus, pauses, pauseIncluded, rest: breakTime, overage, away, awayIncluded }: ReturnType<typeof report>['entries'][number]) {
    const rest = cycle.rest
    return <li key={cycle.id}>
      <button className="entry" onClick={() => setSelected(cycle.id)}>
        <span className="entry-content">
          <span className="entry-line">
            <span><strong>Focus session</strong><small>{cycle.status === 'paused'
              ? `${shortClock.format(cycle.start)} · ${pauseStatus(cycle)}`
              : activityTime(cycle.start, cycle.end)}</small></span>
            <span><strong>{preciseDuration(focus)} focused</strong></span>
          </span>
          {[{ label: 'Manual pause', elapsed: pauses, included: pauseIncluded },
            { label: 'Paused while away', elapsed: away, included: awayIncluded }].map(({ label, elapsed, included }) =>
              elapsed > 0 && <span className="entry-line" key={label}>
                <span>{label}<small>{included > 0 && `${preciseDuration(included)} included`}
                  {included > 0 && elapsed > included && ' · '}
                  {elapsed > included && `${preciseDuration(elapsed - included)} extra`}</small></span>
                <span>{preciseDuration(elapsed)}</span>
              </span>)}
          {rest && breakTime > 0 && <span className="entry-line">
            <span>Break<small>{activityTime(rest.start, rest.end)}</small></span>
            <span>{preciseDuration(breakTime)}{overage > 0 && <small>{preciseDuration(overage)} over allowance</small>}</span>
          </span>}
        </span>
        <span className="entry-arrow" aria-hidden="true">›</span>
      </button>
    </li>
  }

  if (day && daily) return <section className="report">
    <button className="quiet" onClick={() => setDay(undefined)}>← Week</button>
    <h1>{day.toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h1>
    <TrackedTotals {...daily} />
    <p className="split">Completing a focus goal earns break time. Unused break time covers later breaks and pauses, including time away. Time past your balance is extra. End Session clears the balance.</p>
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
    <TrackedTotals {...weekly} />
    <h2>Tracked time by day</h2>
    <ul className="chart-legend">
      <li><span className="chart-included" />Focus + included breaks</li>
      <li><span className="chart-extra" />Extra time</li>
    </ul>
    <div className="chart">{reports.map(({ focus, included, overage, extra, tracked }, index) => {
      const covered = focus + included
      const tooltipId = `day-breakdown-${index}`
      return <div className="chart-day" key={weekdays[index]}>
        <button aria-describedby={tooltipId}
          aria-label={`${weekdays[index]}, ${dayLabel(days[index])}, ${preciseDuration(tracked)} tracked`}
          onClick={() => setDay(days[index])}>
          <span className="chart-total">{preciseDuration(tracked)}</span>
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
          <span>Extra pause <strong>{durationClockText(extra - overage)}</strong></span>
          <span>Extra break <strong>{durationClockText(overage)}</strong></span>
        </div>
      </div>
    })}</div>
  </section>
}
