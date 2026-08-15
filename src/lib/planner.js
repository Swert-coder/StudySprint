import { isoToday, daysUntil, dateAfter, WEEKDAYS } from './dates';
import { priorityValue, difficultyValue } from './constants';
import { adjustmentFor } from './personalization';
import { chapterKey as makeChapterKey } from './examCountdown';

export const plannedMinutes = (sessions, type, id, completedOnly = true, chapterKeyFilter = undefined) =>
  sessions
    .filter((s) => s.sourceType === type && s.sourceId === id && (chapterKeyFilter === undefined || s.chapterKey === chapterKeyFilter) && (!completedOnly || s.complete))
    .reduce((sum, s) => sum + s.minutes, 0);

// Per-day study capacity: a one-off override (Panic Mode, "I have 30 minutes tonight") wins first,
// then a blocked date, then a specific-date override, then the student's per-weekday schedule,
// falling all the way back to the flat daily goal when none of that has been customized.
export function availableMinutesFor(data, date, overrides = null) {
  if (overrides && overrides[date] != null) return overrides[date];
  const { profile } = data;
  if (profile.blockedDates?.includes(date)) return 0;
  if (profile.dateOverrides?.[date] != null) return profile.dateOverrides[date];
  if (profile.weekdayMinutes) {
    const wd = WEEKDAYS[new Date(`${date}T12:00:00`).getDay()];
    const val = profile.weekdayMinutes[wd];
    if (val != null) return val;
  }
  return +profile.dailyGoal || 120;
}

// Turns assignments + tests into a flat list of schedulable work items. A test with a generated
// chapterPlan (see examCountdown.js) expands into one task per learn/practice/review chapter phase
// instead of one flat "test prep" task; a test without material behaves exactly as before.
export function buildPlannerTasks(data, today = isoToday()) {
  const assignments = data.assignments
    .filter((a) => !a.done)
    .map((a) => {
      const base = Math.max(0, (+a.minutes || 45) - plannedMinutes(data.sessions, 'assignment', a.id));
      const adj = adjustmentFor(data.personalization, a.course, 'assignment');
      return {
        type: 'assignment', id: a.id, sourceId: a.id, chapterKey: null, targetDate: null,
        title: a.title, subject: a.course, due: a.due,
        remaining: Math.round(base * adj),
        priority: a.priority || 'Medium', difficulty: a.difficulty || 'Medium',
      };
    });

  const tests = data.tests.flatMap((t) => {
    const adj = adjustmentFor(data.personalization, t.course, 'test');
    const priority = daysUntil(t.date, today) <= 4 ? 'High' : 'Medium';
    if (t.chapterPlan?.length) {
      return t.chapterPlan.map((entry) => {
        const key = makeChapterKey(entry.chapter, entry.phase);
        const base = Math.max(0, entry.minutes - plannedMinutes(data.sessions, 'test', t.id, true, key));
        return {
          type: 'test', id: `${t.id}:${key}`, sourceId: t.id, chapterKey: key, targetDate: entry.date,
          title: `${entry.chapter} — ${entry.phase}`, subject: t.course, due: t.date,
          remaining: Math.round(base * adj),
          priority: entry.phase === 'review' && daysUntil(t.date, today) > 3 ? 'Low' : priority,
          difficulty: t.difficulty || 'Medium',
        };
      });
    }
    const base = Math.max(0, (+t.studyMinutes || 120) - plannedMinutes(data.sessions, 'test', t.id));
    return [{
      type: 'test', id: t.id, sourceId: t.id, chapterKey: null, targetDate: null,
      title: `${t.title} prep`, subject: t.course, due: t.date,
      remaining: Math.round(base * adj),
      priority, difficulty: t.difficulty || 'Medium',
    }];
  });

  return [...assignments, ...tests].filter((t) => t.remaining > 0 && daysUntil(t.due, today) >= -7);
}

export function reasonFor(task, day, limited = false) {
  const left = daysUntil(task.due, day);
  if (left < 0) return 'Overdue work needs attention';
  if (left === 0) return 'Due today';
  if (left === 1) return 'Due tomorrow';
  if (task.type === 'test' && left <= 4) return `${task.subject} test is approaching`;
  if (limited) return 'Limited time means this has the biggest impact';
  if (task.difficulty === 'Hard') return 'This has a high estimated workload';
  return `Due in ${left} days`;
}

const scoreTask = (t, date) => {
  const left = Math.max(0, daysUntil(t.due, date));
  const urgency = t.type === 'test' ? Math.max(0, 12 - left * 1.8) : Math.max(0, 14 - left * 2.2);
  const workload = Math.min(8, t.remaining / 35);
  const dailyNeed = t.remaining / Math.max(1, left + 1);
  // Soft nudge for chapter-phase tasks: near-zero until the exam-countdown's suggested date for
  // this phase arrives, then rises — without it ever being a hard constraint or a hard cutoff.
  const targetBonus = t.targetDate ? Math.max(0, Math.min(4, -daysUntil(t.targetDate, date) * 0.6 + 2)) : 0;
  return urgency + priorityValue[t.priority] * 2 + difficultyValue[t.difficulty] + workload + dailyNeed / 18 + targetBonus;
};

// The core scheduler: greedily fills each day's available capacity with the highest-scoring work,
// day by day, until every task's remaining minutes are placed or the horizon runs out.
export function makeSmartPlan(data, today = isoToday(), overrides = null) {
  const tasks = buildPlannerTasks(data, today).map((t) => ({ ...t, remaining: Math.ceil(t.remaining / 5) * 5 }));
  const sessions = data.sessions.filter((s) => s.complete || !s.generated);
  const dueOffsets = tasks.map((t) => Math.max(0, daysUntil(t.due, today)));
  const horizon = Math.max(7, Math.min(30, (dueOffsets.length ? Math.max(...dueOffsets) : 0) + 1));

  for (let offset = 0; offset < horizon && tasks.some((t) => t.remaining > 0); offset++) {
    const date = dateAfter(today, offset);
    let capacity = availableMinutesFor(data, date, overrides);
    if (capacity <= 0) continue;
    let guard = 0;
    const scheduledToday = new Set();
    while (capacity >= 20 && tasks.some((t) => t.remaining > 0 && !scheduledToday.has(t.type + t.id)) && guard++ < 30) {
      const candidates = tasks
        .filter((t) => t.remaining > 0 && !scheduledToday.has(t.type + t.id))
        .map((t) => ({ ...t, score: scoreTask(t, date) }))
        .sort((a, b) => b.score - a.score);
      const picked = candidates[0];
      if (!picked) break;
      const block = Math.min(capacity, picked.remaining, picked.type === 'test' ? 45 : 50, Math.max(25, Math.ceil(picked.remaining / Math.max(1, daysUntil(picked.due, date) + 1) / 5) * 5));
      if (block < 20) break;
      sessions.push({
        id: `plan-${picked.type}-${picked.id}-${date}-${guard}`,
        date, title: picked.title, subject: picked.subject, minutes: block,
        complete: false, generated: true, sourceType: picked.type, sourceId: picked.sourceId,
        chapterKey: picked.chapterKey, examPhase: picked.chapterKey ? picked.chapterKey.split('::')[1] : null,
        priority: picked.priority, reason: reasonFor(picked, date, capacity < 90),
      });
      const task = tasks.find((t) => t.type === picked.type && t.id === picked.id);
      task.remaining -= block;
      capacity -= block;
      scheduledToday.add(task.type + task.id);
    }
  }
  return { ...data, sessions };
}

// Given a time budget, greedily picks the highest-value combination of work that fits — reusing
// the exact same scoring formula as makeSmartPlan so the "why this?" reasoning stays consistent.
export function whatShouldIDoNow(data, budgetMinutes, today = isoToday()) {
  const tasks = buildPlannerTasks(data, today).map((t) => ({ ...t, remaining: Math.ceil(t.remaining / 5) * 5 }));
  const scored = tasks.map((t) => ({ ...t, score: scoreTask(t, today) })).sort((a, b) => b.score - a.score);

  let capacity = Math.max(0, +budgetMinutes || 0);
  const picks = [];
  for (const t of scored) {
    if (capacity < 10) break;
    const block = Math.min(capacity, t.remaining, t.type === 'test' ? 45 : 50);
    if (block < 5) continue;
    picks.push({ ...t, minutes: block, reason: reasonFor(t, today, budgetMinutes < 90) });
    capacity -= block;
  }
  return { picks, totalMinutes: (+budgetMinutes || 0) - capacity };
}

// A one-day capacity override that protects the highest-priority work and pushes the rest back,
// without permanently changing the student's baseline daily goal.
export function panicPlan(data, minutes, today = isoToday()) {
  return makeSmartPlan(data, today, { [today]: minutes });
}
