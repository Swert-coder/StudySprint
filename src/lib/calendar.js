// Pure read-projection over the same data the rest of the app already uses — no separate storage,
// so anything the AI organizer / command matcher / manual UI changes shows up on the calendar instantly.
export function eventsFor(data, { from, to }) {
  const inRange = (date) => date >= from && date <= to;
  const events = [];
  for (const a of data.assignments) {
    if (inRange(a.due)) events.push({ kind: 'assignment', date: a.due, id: a.id, title: a.title, subject: a.course, done: a.done, priority: a.priority, color: a.color, ref: a });
  }
  for (const t of data.tests) {
    if (inRange(t.date)) events.push({ kind: 'test', date: t.date, id: t.id, title: t.title, subject: t.course, color: t.color, ref: t });
  }
  for (const s of data.sessions) {
    if (inRange(s.date)) events.push({ kind: 'session', date: s.date, id: s.id, title: s.title, subject: s.subject, minutes: s.minutes, complete: s.complete, generated: s.generated, reason: s.reason, ref: s });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export function eventsByDate(data, { from, to }) {
  const map = {};
  for (const e of eventsFor(data, { from, to })) (map[e.date] ??= []).push(e);
  return map;
}

export const toISODate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// 6 weeks (Sun-Sat) covering the month that `cursorISO` falls in, including the leading/trailing
// days from adjacent months needed to fill the grid.
export function monthGrid(cursorISO) {
  const cursor = new Date(`${cursorISO}T12:00:00`);
  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - firstOfMonth.getDay());
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => toISODate(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + w * 7 + d)))
  );
}

// The 7 dates (Sun-Sat) of the week containing `cursorISO`.
export function weekDates(cursorISO) {
  const cursor = new Date(`${cursorISO}T12:00:00`);
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - cursor.getDay());
  return Array.from({ length: 7 }, (_, i) => toISODate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
}
