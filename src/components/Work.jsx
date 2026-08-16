import { useState } from 'react';
import { niceDate } from '../lib/dates';
import { difficultyColor } from '../lib/constants';
import { Assignment } from './shared';

export default function Work({ data, setModal, setTab, toggleAssignment, removeAssignment, removeAssignments, removeTest, removeTests, startAssignmentSprint, editAssignment }) {
  const [selected, setSelected] = useState(() => new Set());
  const selectedIds = data.assignments.filter((a) => selected.has(a.id)).map((a) => a.id);
  const toggleSelect = (id) => setSelected((s) => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const deleteSelected = () => { removeAssignments(selectedIds); setSelected(new Set()); };

  const [selectedTests, setSelectedTests] = useState(() => new Set());
  const selectedTestIds = data.tests.filter((t) => selectedTests.has(t.id)).map((t) => t.id);
  const toggleSelectTest = (id) => setSelectedTests((s) => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const deleteSelectedTests = () => { removeTests(selectedTestIds); setSelectedTests(new Set()); };

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
        <div className="section-title">
          <h2>Assignments</h2>
          <div className="section-title-actions">
            {selectedIds.length > 0 && <button className="bulk-delete-btn" onClick={deleteSelected}>Delete selected ({selectedIds.length})</button>}
            <span>{data.assignments.filter((x) => !x.done).length} remaining</span>
          </div>
        </div>
        {data.assignments.map((a) => (
          <div className="assignment-row" key={a.id}>
            <input type="checkbox" className="select-check" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} aria-label={`Select ${a.title}`} />
            <div style={{ flex: 1 }}><Assignment a={a} toggle={toggleAssignment} remove={removeAssignment} /></div>
            <button className="edit-btn" onClick={() => editAssignment(a)}>Edit</button>
            {!a.done && <button className="sprint-btn" onClick={() => startAssignmentSprint(a)}>⌁ Sprint</button>}
          </div>
        ))}
        {!data.assignments.length && <p className="muted">No assignments yet — add one to get started.</p>}
      </div>
      <div className="panel tests">
        <div className="section-title">
          <h2>Tests &amp; exams</h2>
          <div className="section-title-actions">
            {selectedTestIds.length > 0 && <button className="bulk-delete-btn" onClick={deleteSelectedTests}>Delete selected ({selectedTestIds.length})</button>}
            <button onClick={() => setModal('tests')}>＋ Add test</button>
          </div>
        </div>
        {data.tests.map((t) => (
          <div className="test" key={t.id}>
            <input type="checkbox" className="select-check" checked={selectedTests.has(t.id)} onChange={() => toggleSelectTest(t.id)} aria-label={`Select ${t.title}`} />
            <i style={{ background: difficultyColor(t.difficulty) }} />
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
