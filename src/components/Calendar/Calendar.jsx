import { useState } from 'react';
import { isoToday } from '../../lib/dates';
import { toISODate } from '../../lib/calendar';
import MonthView from './MonthView';
import WeekView from './WeekView';
import DayView from './DayView';
import DayDetailModal from './DayDetailModal';

const MONTH_LABEL = (iso) => new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(`${iso}T12:00:00`));
const WEEK_LABEL = (iso) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(`${iso}T12:00:00`));
const DAY_LABEL = (iso) => new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${iso}T12:00:00`));

export default function Calendar({ data, onEditAssignment, onToggleSession, onStartSessionSprint }) {
  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(isoToday());
  const [selected, setSelected] = useState(null);

  const shift = (dir) => {
    const d = new Date(`${cursor}T12:00:00`);
    if (view === 'month') d.setMonth(d.getMonth() + dir);
    else if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCursor(toISODate(d));
  };

  const handleSelectEvent = (event) => {
    if (event.kind === 'assignment') { onEditAssignment(event.ref); return; }
    setSelected(event);
  };
  const handleSelectDate = (date) => { setCursor(date); setView('day'); };

  const label = view === 'month' ? MONTH_LABEL(cursor) : view === 'week' ? `Week of ${WEEK_LABEL(cursor)}` : DAY_LABEL(cursor);

  return (
    <div className="page">
      <div className="page-heading">
        <div><h1>Calendar</h1><p>Everything StudySprint is planning, in one connected view.</p></div>
        <div className="cal-view-switch">
          {['month', 'week', 'day'].map((v) => <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}
        </div>
      </div>
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button onClick={() => shift(-1)}>‹</button>
          <button className="cal-today-btn" onClick={() => setCursor(isoToday())}>Today</button>
          <button onClick={() => shift(1)}>›</button>
        </div>
        <b className="cal-label">{label}</b>
      </div>
      <div className="panel cal-panel">
        {view === 'month' && <MonthView data={data} cursor={cursor} onSelectDate={handleSelectDate} onSelectEvent={handleSelectEvent} />}
        {view === 'week' && <WeekView data={data} cursor={cursor} onSelectEvent={handleSelectEvent} />}
        {view === 'day' && <DayView data={data} cursor={cursor} onToggleSession={onToggleSession} onSelectEvent={handleSelectEvent} />}
      </div>
      {selected && <DayDetailModal event={selected} onClose={() => setSelected(null)} onStartSessionSprint={onStartSessionSprint} onToggleSession={onToggleSession} />}
    </div>
  );
}
