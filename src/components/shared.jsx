import { niceDate } from '../lib/dates';

export const Stat = ({ icon, label, value, note }) => (
  <div className="stat">
    <div className="stat-icon">{icon}</div>
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
      <p>{note}</p>
    </div>
  </div>
);

export const Session = ({ s, toggle }) => (
  <div className={'session ' + (s.complete ? 'completed' : '')}>
    <button className="check" onClick={() => toggle(s.id)}>{s.complete ? '✓' : ''}</button>
    <div>
      <b>{s.title}</b>
      <small>{s.minutes} min focus session</small>
    </div>
    <span>›</span>
  </div>
);

export const Assignment = ({ a, toggle, remove }) => (
  <div className={'assignment ' + (a.done ? 'done' : '')}>
    <button className="check" aria-label={`Mark ${a.title} complete`} onClick={() => toggle(a.id)}>{a.done ? '✓' : ''}</button>
    <i style={{ background: a.color }} />
    <div>
      <b>{a.title}</b>
      <small>{a.course} · Due {niceDate(a.due)}</small>
    </div>
    <label className={a.priority.toLowerCase()}>{a.priority}</label>
    {remove && <button className="remove" aria-label={`Remove ${a.title}`} title="Remove assignment" onClick={() => remove(a.id)}>×</button>}
  </div>
);
