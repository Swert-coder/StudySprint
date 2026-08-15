import { useMemo } from 'react';
import { day, niceDate } from '../lib/dates';
import { Session } from './shared';
import Empty from './Empty';

export default function Plan({ data, createPlan, toggleSession }) {
  const grouped = useMemo(
    () => Object.entries(data.sessions.reduce((a, s) => { (a[s.date] ??= []).push(s); return a; }, {})).sort(([a], [b]) => a.localeCompare(b)),
    [data]
  );
  return (
    <div className="page">
      <div className="page-heading">
        <div><h1>Study plan</h1><p>A focused path from now to your finish line.</p></div>
        <button className="primary" onClick={createPlan}>✦ Refresh plan</button>
      </div>
      <div className="plan-list">
        {grouped.map(([date, sessions]) => (
          <section className="day-card" key={date}>
            <div className="date-pill"><b>{day(date)}</b><span>{niceDate(date)}</span></div>
            <div>{sessions.map((s) => <Session key={s.id} s={s} toggle={toggleSession} />)}</div>
          </section>
        ))}
        {!grouped.length && <Empty text="Add assignments, then let Study Sprint make the plan." />}
      </div>
    </div>
  );
}
