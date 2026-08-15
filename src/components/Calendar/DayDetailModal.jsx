import { niceDate } from '../../lib/dates';

export default function DayDetailModal({ event, onClose, onStartSessionSprint, onToggleSession }) {
  if (!event) return null;
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal cal-detail-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className="close" onClick={onClose}>×</button>
        {event.kind === 'test' ? (
          <>
            <span className="eyebrow">TEST · {niceDate(event.date)}</span>
            <h2>{event.title}</h2>
            {event.ref.topics && <p>{event.ref.topics}</p>}
            {event.ref.chapterPlan?.length ? (
              <ol className="exam-plan-list">
                {event.ref.chapterPlan.map((entry, i) => <li key={i}><b>{niceDate(entry.date)}</b> — {entry.phase} {entry.chapter} ({entry.minutes} min)</li>)}
              </ol>
            ) : <p className="muted">No prep plan yet — add chapters or material when creating this test to get one.</p>}
          </>
        ) : (
          <>
            <span className="eyebrow">STUDY SESSION · {niceDate(event.date)}</span>
            <h2>{event.title}</h2>
            <p>{event.ref.subject || 'Study block'} · {event.minutes} min</p>
            {event.ref.reason && <p className="muted">{event.ref.reason}</p>}
            {!event.complete && (
              <div className="cal-detail-actions">
                <button className="primary" onClick={() => { onStartSessionSprint(event.ref); onClose(); }}>Start sprint</button>
                <button className="reset" onClick={() => { onToggleSession(event.id); onClose(); }}>Mark complete</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
