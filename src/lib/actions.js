import { isoToday, dateAfter } from './dates';
import { panicPlan, plannedMinutes } from './planner';
import { buildExamPlan, parseChapters } from './examCountdown';
import { confidentMatch } from './fuzzy';

// Actions in this set always require an explicit confirmation tap, no matter what the AI's own
// `requiresConfirmation` hint says — defense in depth against a bad/ambiguous model response.
const ALWAYS_CONFIRM = new Set(['create_assignment', 'create_test', 'set_weekday_schedule', 'delete_test']);

export function needsConfirmation(action) {
  if (action.type === 'move_sessions' && action.payload?.scope && action.payload.scope !== 'session') return true;
  return ALWAYS_CONFIRM.has(action.type);
}

const resolveAssignment = (data, payload) =>
  (payload.id != null && data.assignments.find((a) => a.id === payload.id)) ||
  (payload.titleMatch && confidentMatch(data.assignments.filter((a) => !a.done), payload.titleMatch, ['course'])) ||
  null;

const resolveTest = (data, payload) =>
  (payload.id != null && data.tests.find((t) => t.id === payload.id)) ||
  (payload.titleMatch && confidentMatch(data.tests, payload.titleMatch, ['course'])) ||
  null;

const resolveSession = (data, payload) =>
  (payload.sessionId != null && data.sessions.find((s) => s.id === payload.sessionId)) ||
  (payload.titleMatch && confidentMatch(data.sessions.filter((s) => !s.complete), payload.titleMatch, ['subject'])) ||
  null;

// The single place an action (from the AI organizer, the local command matcher, or manual UI
// buttons) turns into a real data mutation, so every entry point behaves identically.
export function applyAction(action, data, today = isoToday()) {
  const { type, payload = {} } = action;
  switch (type) {
    case 'create_assignment': {
      const item = {
        id: Date.now(), title: payload.title || 'New assignment', course: payload.course || '',
        due: payload.due || dateAfter(today, 1), minutes: +payload.minutes || 45,
        priority: payload.priority || 'Medium', difficulty: payload.difficulty || 'Medium',
        material: payload.material || '', done: false,
      };
      return { data: { ...data, assignments: [...data.assignments, item] }, message: `Added "${item.title}" — your sprint updated.` };
    }
    case 'create_test': {
      const chapters = parseChapters(payload.material || payload.topics || '');
      const test = {
        id: Date.now(), title: payload.title || 'New test', course: payload.course || '',
        date: payload.date || dateAfter(today, 7), topics: payload.topics || payload.material || '',
        material: payload.material || '', chapters, studyMinutes: +payload.studyMinutes || 120,
        difficulty: payload.difficulty || 'Medium',
      };
      test.chapterPlan = chapters.length ? buildExamPlan(test, today) : null;
      return { data: { ...data, tests: [...data.tests, test] }, message: `Added "${test.title}" — a study plan is ready.` };
    }
    case 'delete_test': {
      const test = resolveTest(data, payload);
      if (!test) return { data, message: `Couldn't find that test.` };
      return {
        data: {
          ...data,
          tests: data.tests.filter((t) => t.id !== test.id),
          sessions: data.sessions.filter((s) => !(s.sourceType === 'test' && s.sourceId === test.id)),
        },
        message: `Removed "${test.title}" and its study sessions.`,
      };
    }
    case 'mark_complete': {
      if (payload.targetType === 'test') {
        const test = resolveTest(data, payload);
        if (!test) return { data, message: `Couldn't find that test.` };
        return {
          data: { ...data, tests: data.tests.map((t) => (t.id === test.id ? { ...t, studyMinutes: plannedMinutes(data.sessions, 'test', t.id), chapterPlan: null } : t)) },
          message: `Marked "${test.title}" complete — no more prep scheduled for it.`,
        };
      }
      if (payload.targetType === 'session') {
        const session = resolveSession(data, payload);
        if (!session) return { data, message: `Couldn't find that study session.` };
        return {
          data: { ...data, sessions: data.sessions.map((s) => (s.id === session.id ? { ...s, complete: true, completedAt: new Date().toISOString() } : s)) },
          message: `Marked "${session.title}" complete.`,
        };
      }
      const assignment = resolveAssignment(data, payload);
      if (!assignment) return { data, message: `Couldn't find that assignment — try naming it more specifically.` };
      return {
        data: { ...data, assignments: data.assignments.map((a) => (a.id === assignment.id ? { ...a, done: true } : a)) },
        message: `Marked "${assignment.title}" complete. Nice work.`,
      };
    }
    case 'update_progress': {
      const assignment = resolveAssignment(data, payload);
      if (!assignment) return { data, message: `Couldn't find that assignment.` };
      const fraction = Math.max(0, Math.min(1, +payload.fractionDone || 0));
      const targetMinutes = Math.round((+assignment.minutes || 45) * fraction);
      const alreadyDone = data.sessions.filter((s) => s.sourceType === 'assignment' && s.sourceId === assignment.id && s.complete).reduce((sum, s) => sum + s.minutes, 0);
      const delta = targetMinutes - alreadyDone;
      const sessions = delta > 0
        ? [...data.sessions, { id: Date.now(), date: today, title: assignment.title, subject: assignment.course, minutes: delta, complete: true, sourceType: 'assignment', sourceId: assignment.id, completedAt: new Date().toISOString() }]
        : data.sessions;
      return { data: { ...data, sessions }, message: `Updated progress on "${assignment.title}".` };
    }
    case 'move_sessions': {
      const { scope, fromDate, toDate } = payload;
      if (!toDate) return { data, message: `I need a date to move that to.` };
      if (scope === 'session') {
        const session = resolveSession(data, payload);
        if (!session) return { data, message: `Couldn't find that study session.` };
        return { data: { ...data, sessions: data.sessions.map((s) => (s.id === session.id ? { ...s, date: toDate } : s)) }, message: `Moved "${session.title}" to ${toDate}.` };
      }
      const from = scope === 'date' ? fromDate : today;
      const moved = data.sessions.filter((s) => s.date === from && !s.complete).length;
      const sessions = data.sessions.map((s) => (s.date === from && !s.complete ? { ...s, date: toDate } : s));
      return { data: { ...data, sessions }, message: `Moved ${moved} item${moved === 1 ? '' : 's'} from ${from} to ${toDate}.` };
    }
    case 'block_date': {
      if (!payload.date) return { data, message: `Which date should I block off?` };
      const blockedDates = Array.from(new Set([...(data.profile.blockedDates || []), payload.date]));
      return { data: { ...data, profile: { ...data.profile, blockedDates } }, message: `Got it — ${payload.date} is blocked off. Rebuilding your schedule around it.` };
    }
    case 'unblock_date': {
      const blockedDates = (data.profile.blockedDates || []).filter((d) => d !== payload.date);
      return { data: { ...data, profile: { ...data.profile, blockedDates } }, message: `${payload.date} is available again.` };
    }
    case 'set_day_available_minutes': {
      const date = payload.date || today;
      const dateOverrides = { ...(data.profile.dateOverrides || {}), [date]: Math.max(0, +payload.minutes || 0) };
      return { data: { ...data, profile: { ...data.profile, dateOverrides } }, message: `Updated ${date === today ? "today's" : date} available time to ${payload.minutes} minutes.` };
    }
    case 'set_weekday_schedule': {
      const weekdayMinutes = { ...(data.profile.weekdayMinutes || {}), ...(payload.weekdayMinutes || {}) };
      return { data: { ...data, profile: { ...data.profile, weekdayMinutes } }, message: `Updated your weekly schedule.` };
    }
    case 'panic_mode': {
      const minutes = Math.max(5, +payload.availableMinutes || 60);
      return { data: panicPlan(data, minutes, today), message: `Here's a simplified plan for the next ${minutes} minutes.` };
    }
    case 'rebuild_plan':
    case 'answer_query':
      return { data, message: null };
    default:
      return { data, message: null };
  }
}

// Turns "What should I do right now?" picks into real sessions the moment the student starts the
// sprint, so SprintSession operates on real session records and they immediately show on the calendar.
export function startSprintFromPicks(data, picks, today = isoToday()) {
  const newSessions = picks.map((p, i) => ({
    id: `sprint-${Date.now()}-${i}`, date: today, title: p.title, subject: p.subject, minutes: p.minutes,
    complete: false, generated: true, sourceType: p.type, sourceId: p.sourceId, chapterKey: p.chapterKey,
    priority: p.priority, reason: p.reason,
  }));
  return { data: { ...data, sessions: [...data.sessions, ...newSessions] }, queue: newSessions };
}

// Reused by the Analyzer's "Add these to my study plan" and the Practice Quiz's "Study weak areas".
export function addTopicsToWork(data, topics, today = isoToday()) {
  const items = topics.map((t, i) => ({
    id: Date.now() + i, title: `Review: ${t}`, course: data.profile.className || 'Study',
    due: dateAfter(today, 3), minutes: 40, priority: 'Medium', done: false,
  }));
  return { ...data, assignments: [...data.assignments, ...items] };
}
