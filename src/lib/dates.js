export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const day = (date) => new Intl.DateTimeFormat('en', { weekday: 'short' }).format(new Date(`${date}T12:00:00`));
export const niceDate = (date) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
export const isoToday = () => new Date().toISOString().slice(0, 10);
export const daysUntil = (date, from = isoToday()) => Math.ceil((new Date(`${date}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000);
export const dateAfter = (date, days) => new Date(new Date(`${date}T12:00:00`).getTime() + days * 86400000).toISOString().slice(0, 10);
export const weekdayName = (date) => WEEKDAYS[new Date(`${date}T12:00:00`).getDay()];

// Resolves a weekday name ("Saturday", "sat") to the next date it falls on, including today if it matches.
export const nextWeekdayDate = (name, from = isoToday()) => {
  const target = WEEKDAYS.findIndex((w) => w.toLowerCase().startsWith(name.toLowerCase().slice(0, 3)));
  if (target === -1) return null;
  const fromIdx = new Date(`${from}T12:00:00`).getDay();
  let diff = target - fromIdx;
  if (diff < 0) diff += 7;
  return dateAfter(from, diff);
};

export const timeOfDay = (hour = new Date().getHours()) => (hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening');
