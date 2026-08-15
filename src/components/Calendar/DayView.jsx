import { eventsFor } from '../../lib/calendar';
import { Session } from '../shared';
import Empty from '../Empty';

export default function DayView({ data, cursor, onToggleSession, onSelectEvent }) {
  const events = eventsFor(data, { from: cursor, to: cursor });
  const sessions = events.filter((e) => e.kind === 'session');
  const assignments = events.filter((e) => e.kind === 'assignment');
  const tests = events.filter((e) => e.kind === 'test');

  return (
    <div className="cal-day">
      {!events.length && <Empty text="Nothing scheduled for this day." />}
      {tests.length > 0 && (
        <div className="cal-day-section">
          <h3>Tests</h3>
          {tests.map((t) => (
            <button type="button" key={t.id} className="cal-day-row" onClick={() => onSelectEvent(t)}>
              <i style={{ background: t.color }} /><b>{t.title}</b><small>{t.subject}</small>
            </button>
          ))}
        </div>
      )}
      {sessions.length > 0 && (
        <div className="cal-day-section">
          <h3>Study sessions</h3>
          {sessions.map((s) => <Session key={s.id} s={s.ref} toggle={onToggleSession} />)}
        </div>
      )}
      {assignments.length > 0 && (
        <div className="cal-day-section">
          <h3>Due today</h3>
          {assignments.map((a) => (
            <button type="button" key={a.id} className="cal-day-row" onClick={() => onSelectEvent(a)}>
              <i style={{ background: a.color }} /><b>{a.title}</b><small>{a.subject}</small>
              <label className={(a.priority || 'Medium').toLowerCase()}>{a.priority}</label>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
