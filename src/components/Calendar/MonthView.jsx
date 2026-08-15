import { monthGrid, eventsByDate } from '../../lib/calendar';
import { isoToday } from '../../lib/dates';
import EventChip from './EventChip';

const CHIP_LIMIT = 3;

export default function MonthView({ data, cursor, onSelectDate, onSelectEvent }) {
  const weeks = monthGrid(cursor);
  const from = weeks[0][0];
  const to = weeks[weeks.length - 1][6];
  const byDate = eventsByDate(data, { from, to });
  const cursorMonth = new Date(`${cursor}T12:00:00`).getMonth();
  const today = isoToday();

  return (
    <div className="cal-month">
      <div className="cal-weekday-row">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => <span key={w}>{w}</span>)}</div>
      <div className="cal-month-grid">
        {weeks.flat().map((date) => {
          const events = byDate[date] || [];
          const inMonth = new Date(`${date}T12:00:00`).getMonth() === cursorMonth;
          return (
            <div key={date} className={`cal-day-cell${inMonth ? '' : ' cal-day-outside'}${date === today ? ' cal-day-today' : ''}`}>
              <button type="button" className="cal-day-number" onClick={() => onSelectDate(date)}>{new Date(`${date}T12:00:00`).getDate()}</button>
              <div className="cal-chip-list">
                {events.slice(0, CHIP_LIMIT).map((e) => <EventChip key={`${e.kind}-${e.id}`} event={e} onClick={onSelectEvent} />)}
                {events.length > CHIP_LIMIT && <button type="button" className="cal-more" onClick={() => onSelectDate(date)}>+{events.length - CHIP_LIMIT} more</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
