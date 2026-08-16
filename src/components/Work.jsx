import { niceDate } from '../lib/dates';
import { Assignment } from './shared';

export default function Work({ data, setModal, setTab, toggleAssignment, removeAssignment, removeTest, startAssignmentSprint, editAssignment }) {
  return (
    <div className="page">
      <div className="page-heading">
        <div><h1>Assignments</h1><p>Everything you need to get done, in one calm place.</p></div>
        <div className="page-heading-actions">
          <button className="edit-btn" onClick={() => setTab('Import Syllabus')}>⇪ Import syllabus</button>
          <button className="primary" onClick={() => setModal('assignments')}>＋ Assignment</button>
        </div>
      </div>
      <div className="panel work-list">
        <div className="section-title"><h2>Assignments</h2><span>{data.assignments.filter((x) => !x.done).length} remaining</span></div>
        {data.assignments.map((a) => (
          <div className="assignment-row" key={a.id}>
            <div style={{ flex: 1 }}><Assignment a={a} toggle={toggleAssignment} remove={removeAssignment} /></div>
            <button className="edit-btn" onClick={() => editAssignment(a)}>Edit</button>
            {!a.done && <button className="sprint-btn" onClick={() => startAssignmentSprint(a)}>⌁ Sprint</button>}
          </div>
        ))}
        {!data.assignments.length && <p className="muted">No assignments yet — add one to get started.</p>}
      </div>
      <div className="panel tests">
        <div className="section-title"><h2>Tests &amp; exams</h2><button onClick={() => setModal('tests')}>＋ Add test</button></div>
        {data.tests.map((t) => (
          <div className="test" key={t.id}>
            <i style={{ background: t.color }} />
            <div>
              <b>{t.title}</b>
              <small>{t.course} · {t.topics}{t.chapterPlan?.length ? ' · prep plan ready' : ''}</small>
            </div>
            <strong>{niceDate(t.date)}</strong>
            <button className="remove" aria-label={`Remove ${t.title}`} title="Remove test" onClick={() => removeTest(t.id)}>×</button>
          </div>
        ))}
        {!data.tests.length && <p className="muted">No tests yet.</p>}
      </div>
    </div>
  );
}
