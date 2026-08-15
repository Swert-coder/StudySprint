import { personalizationInsights } from '../lib/personalization';
import Empty from './Empty';

export default function Progress({ data, completed }) {
  const done = data.assignments.filter((a) => a.done).length;
  const all = data.assignments.length || 1;
  const insights = personalizationInsights(data);
  return (
    <div className="page">
      <div className="page-heading"><div><h1>Your progress</h1><p>Celebrate every minute and every milestone.</p></div></div>
      <div className="progress-hero">
        <div><span className="eyebrow">ALL TIME</span><h2>{completed} focused minutes</h2><p>You’re building a habit. Keep showing up for future you.</p></div>
        <div className="big-streak">🔥<b>{data.streak}</b><span>day streak</span></div>
      </div>
      <div className="progress-grid">
        <div className="panel">
          <h2>Completion</h2>
          <div className="completion"><strong>{Math.round((done / all) * 100)}%</strong><span>assignments finished</span></div>
          <div className="bar"><i style={{ width: `${(done / all) * 100}%` }} /></div>
          <p className="muted">{done} of {all} assignments checked off</p>
        </div>
        <div className="panel">
          <h2>What StudySprint has learned</h2>
          {insights.length ? (
            <ul className="insight-list">{insights.map((text, i) => <li key={i}>{text}</li>)}</ul>
          ) : (
            <Empty text="Complete a few more sessions and StudySprint will start surfacing patterns here." />
          )}
        </div>
      </div>
    </div>
  );
}
