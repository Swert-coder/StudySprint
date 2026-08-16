import { useState } from 'react';
import { SYLLABUS_TYPES, findLikelyDuplicate } from '../../lib/syllabus';
import Empty from '../Empty';

const GROUPS = [
  { key: 'tests', label: 'Tests & Quizzes', types: ['test', 'quiz'] },
  { key: 'work', label: 'Assignments & Projects', types: ['assignment', 'project'] },
  { key: 'reading', label: 'Reading & Deadlines', types: ['reading', 'deadline'] },
  { key: 'noschool', label: 'No-school days', types: ['no-school'] },
];

function buildInitialItems(data, extraction) {
  return extraction.items.map((it, i) => {
    let duplicateOf = null;
    if (it.type !== 'no-school' && extraction.className) {
      const isTestLike = it.type === 'test' || it.type === 'quiz';
      const list = isTestLike ? data.tests : data.assignments;
      const dateField = isTestLike ? 'date' : 'due';
      duplicateOf = findLikelyDuplicate(list, it.title, it.date, dateField, extraction.className);
    }
    return { key: i, type: it.type, title: it.title, date: it.date, rawDateText: it.rawDateText, notes: it.notes, include: !duplicateOf, duplicateOf };
  });
}

const isComplete = (it) => (it.type === 'no-school' ? !!it.date : !!it.title.trim() && !!it.date);

function SyllabusItemRow({ item, onChange, onRemove }) {
  const missingDate = !item.date;
  return (
    <div className={'syllabus-item-row' + (!item.include ? ' excluded' : '')}>
      <input type="checkbox" checked={item.include} onChange={(e) => onChange({ include: e.target.checked })} />
      <select value={item.type} onChange={(e) => onChange({ type: e.target.value })}>
        {SYLLABUS_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      {item.type !== 'no-school' && (
        <div className="syllabus-title-cell">
          <input className="syllabus-title-input" value={item.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Title" />
          {item.duplicateOf && <small className="syllabus-dup-badge">Might already be on your plan: “{item.duplicateOf.title}”</small>}
        </div>
      )}
      <div className="syllabus-date-cell">
        <input type="date" className={missingDate ? 'syllabus-date-missing' : ''} value={item.date} onChange={(e) => onChange({ date: e.target.value })} />
        {missingDate ? <small className="syllabus-hint">add a date to include this</small> : item.rawDateText && <small className="muted">{item.rawDateText}</small>}
      </div>
      {item.type !== 'no-school' && <input className="syllabus-notes-input" value={item.notes} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Notes (optional)" />}
      <button type="button" className="remove" onClick={onRemove} title="Remove">×</button>
    </div>
  );
}

export default function SyllabusReview({ data, extraction, onBack, onClose, onImport }) {
  const [className, setClassName] = useState(extraction.className || '');
  const [teacher, setTeacher] = useState(extraction.teacher || '');
  const [term, setTerm] = useState(extraction.term || '');
  const [items, setItems] = useState(() => buildInitialItems(data, extraction));

  const updateItem = (key, patch) => setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const removeItem = (key) => setItems((prev) => prev.filter((it) => it.key !== key));

  const approvedCount = items.filter((it) => it.include && isComplete(it)).length;

  const confirm = () => {
    if (!className.trim()) { alert('Add a class name before importing.'); return; }
    const approved = items.filter((it) => it.include && isComplete(it)).map((it) => ({ type: it.type, title: it.title.trim(), date: it.date, notes: it.notes }));
    onImport({ className: className.trim(), teacher: teacher.trim(), term: term.trim() }, approved);
    onClose();
  };

  return (
    <div className="page syllabus-import">
      <div className="page-heading">
        <div><h1>Review what we found</h1><p>Check everything looks right before adding it to your plan.</p></div>
        <button className="edit-btn" onClick={onBack}>← Back to upload</button>
      </div>

      <div className="panel form syllabus-meta">
        <h2>Class details</h2>
        <div className="syllabus-meta-grid">
          <label>Class name<input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="e.g. AP Biology" /></label>
          <label>Teacher<input value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="optional" /></label>
          <label>Term<input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="optional" /></label>
        </div>
        {extraction.gradingInfo && <p className="muted syllabus-grading">Grading: {extraction.gradingInfo}</p>}
      </div>

      {!items.length ? (
        <Empty text="Nothing was extracted from this syllabus." />
      ) : (
        GROUPS.map((group) => {
          const groupItems = items.filter((it) => group.types.includes(it.type));
          if (!groupItems.length) return null;
          return (
            <div className="panel syllabus-group" key={group.key}>
              <div className="section-title"><h2>{group.label}</h2><span>{groupItems.length}</span></div>
              {groupItems.map((it) => <SyllabusItemRow key={it.key} item={it} onChange={(patch) => updateItem(it.key, patch)} onRemove={() => removeItem(it.key)} />)}
            </div>
          );
        })
      )}

      <div className="syllabus-confirm-bar">
        <span>{approvedCount} item{approvedCount === 1 ? '' : 's'} will be added{className ? ` to ${className}` : ''}</span>
        <div className="syllabus-confirm-actions">
          <button className="reset" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!approvedCount} onClick={confirm}>Add to my plan</button>
        </div>
      </div>
    </div>
  );
}
