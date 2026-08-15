import { weekDates, eventsByDate } from '../../lib/calendar';
import { day, niceDate, isoToday } from '../../lib/dates';
import EventChip from './EventChip';

export default function WeekView({ data, cursor, onSelectEvent }) {
  const dates = weekDates(cursor);
  const byDate = eventsByDate(data, { from: dates[0], to: dates[6] });
  const today = isoToday();

  return (
    <div className="cal-week">
      {dates.map((date) => (
        <div key={date} className={`cal-week-col${date === today ? ' cal-day-today' : ''}`}>
          <div className="cal-week-col-head"><b>{day(date)}</b><span>{niceDate(date)}</span></div>
          <div className="cal-chip-list cal-chip-list-vertical">
            {(byDate[date] || []).map((e) => <EventChip key={`${e.kind}-${e.id}`} event={e} onClick={onSelectEvent} />)}
            {!(byDate[date] || []).length && <span className="cal-empty-day">—</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
