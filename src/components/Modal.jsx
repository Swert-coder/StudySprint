import { useState } from 'react';
import { isoToday, dateAfter } from '../lib/dates';

const tomorrow = dateAfter(isoToday(), 1);

export function Modal({ type, onClose, onSave }) {
  const isA = type === 'assignments';
  const [form, setForm] = useState({ title: '', course: '', due: tomorrow, minutes: 45, priority: 'Medium', difficulty: 'Medium', material: '', date: tomorrow, topics: '' });
  const field = (key, label, kind = 'text') => (
    <label>{label}<input type={kind} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required /></label>
  );
  return (
    <div className="overlay" onMouseDown={onClose}>
      <form className="modal" onSubmit={(e) => { e.preventDefault(); onSave(type, form); }} onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className="close" onClick={onClose}>×</button>
        <span className="eyebrow">NEW {isA ? 'ASSIGNMENT' : 'TEST'}</span>
        <h2>{isA ? 'What needs doing?' : 'Get exam-ready'}</h2>
        {field('title', isA ? 'Assignment name' : 'Test name')}
        {field('course', 'Course')}
        {field(isA ? 'due' : 'date', isA ? 'Due date' : 'Test date', 'date')}
        {isA ? (
          <>
            <label>Estimated time (minutes)<input type="number" min="10" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: +e.target.value })} /></label>
            <label>Priority<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option>Low</option><option>Medium</option><option>High</option></select></label>
            <label>Material <small>(optional — chapters, pages, problem numbers)</small><input value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} placeholder="e.g. Chapter 7, problems 1-20" /></label>
          </>
        ) : (
          <>
            {field('topics', 'Topics to cover (e.g. Chapters 4-6)')}
            <label>Total prep time (minutes)<input type="number" min="20" value={form.studyMinutes || 120} onChange={(e) => setForm({ ...form, studyMinutes: +e.target.value })} /></label>
          </>
        )}
        <label>Difficulty<select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}><option>Easy</option><option>Medium</option><option>Hard</option></select></label>
        <button className="primary submit">Add to sprint →</button>
      </form>
    </div>
  );
}

export function EditAssignmentModal({ assignment, onClose, onSave }) {
  const [form, setForm] = useState(assignment);
  const input = (key, label, type = 'text') => (
    <label>{label}<input type={type} value={form[key] ?? ''} onChange={(e) => setForm({ ...form, [key]: type === 'number' ? +e.target.value : e.target.value })} /></label>
  );
  return (
    <div className="overlay" onMouseDown={onClose}>
      <form className="modal" onSubmit={(e) => { e.preventDefault(); onSave(form); }} onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className="close" onClick={onClose}>×</button>
        <span className="eyebrow">EDIT ASSIGNMENT</span>
        <h2>Update your work</h2>
        {input('title', 'Assignment name')}
        {input('course', 'Course')}
        {input('due', 'Due date', 'date')}
        {input('minutes', 'Estimated time (minutes)', 'number')}
        <label>Priority<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option>Low</option><option>Medium</option><option>High</option></select></label>
        <label>Difficulty<select value={form.difficulty || 'Medium'} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}><option>Easy</option><option>Medium</option><option>Hard</option></select></label>
        {input('material', 'Material (optional)')}
        <button className="primary submit">Save changes</button>
      </form>
    </div>
  );
}
