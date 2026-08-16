import { isoToday, dateAfter } from './dates';

const tomorrow = dateAfter(isoToday(), 1);

export const defaults = {
  profile: {
    name: 'Alex',
    goal: 'Build momentum, one focused session at a time.',
    dailyGoal: 120,
    gradeLevel: '',
    className: '',
    typicalGrade: '',
    learningPreferences: [],
    accommodations: '',
    // weekdayMinutes === null means "not customized" — the planner falls back to dailyGoal for every day.
    weekdayMinutes: null,
    blockedDates: [],
    dateOverrides: {},
    // Recurring (weekday set, date null) or one-off (date set, weekday null) time ranges the
    // planner treats as unavailable, subtracted from that day's minutes rather than zeroing it out.
    blockedTimes: [],
  },
  assignments: [
    { id: 1, title: 'Chapter 8: Cell Division', course: 'Biology', due: tomorrow, minutes: 75, priority: 'High', done: false, color: '#8b7cf6' },
    { id: 2, title: 'Problem Set 4', course: 'Calculus II', due: tomorrow, minutes: 90, priority: 'High', done: false, color: '#38bdf8' },
    { id: 3, title: 'Essay outline', course: 'English Lit', due: dateAfter(isoToday(), 3), minutes: 50, priority: 'Medium', done: false, color: '#fb7185' },
    { id: 4, title: 'Lecture notes review', course: 'Psychology', due: dateAfter(isoToday(), 4), minutes: 40, priority: 'Low', done: false, color: '#f59e0b' },
  ],
  tests: [
    { id: 11, title: 'Biology Midterm', course: 'Biology', date: dateAfter(isoToday(), 7), topics: 'Ch. 5–8', color: '#8b7cf6' },
  ],
  sessions: [
    { id: 21, date: isoToday(), title: 'Calculus II · Problem Set 4', minutes: 45, complete: false },
    { id: 22, date: isoToday(), title: 'Biology · Chapter 8', minutes: 45, complete: false },
  ],
  streak: 4,
  analyses: [],
  quiz: null,
  quizHistory: [],
  syllabi: [],
  assistant: { history: [] },
  personalization: {
    subjectEstimates: {},
    typeEstimates: { assignment: {}, test: {} },
    hourlyCompletion: {},
  },
};

export const seedProfile = (name) => ({
  ...defaults,
  profile: { ...defaults.profile, name: name || defaults.profile.name },
});

// Deep-merges saved data over the defaults so older saved rows — missing any of the newer
// nested fields (profile.weekdayMinutes, assistant, personalization, ...) — still load cleanly.
export const mergeData = (raw, name) => {
  const base = seedProfile(name);
  const merged = { ...base, ...(raw || {}) };
  merged.profile = { ...base.profile, ...(raw?.profile || {}) };
  merged.assistant = { history: raw?.assistant?.history || [] };
  merged.syllabi = raw?.syllabi || [];
  merged.personalization = {
    subjectEstimates: { ...(raw?.personalization?.subjectEstimates || {}) },
    typeEstimates: {
      assignment: { ...(raw?.personalization?.typeEstimates?.assignment || {}) },
      test: { ...(raw?.personalization?.typeEstimates?.test || {}) },
    },
    hourlyCompletion: { ...(raw?.personalization?.hourlyCompletion || {}) },
  };
  // One-time migration: fold the old single `quiz` field into quizHistory the first time it's seen.
  if ((!raw?.quizHistory || !raw.quizHistory.length) && raw?.quiz) {
    merged.quizHistory = [{ ...raw.quiz, id: raw.quiz.id || Date.now(), date: raw.quiz.date || isoToday() }];
  } else {
    merged.quizHistory = raw?.quizHistory || [];
  }
  return merged;
};

export const loadLegacyLocal = (userId, name) => {
  try {
    const raw = localStorage.getItem(`study-sprint-data-${userId}`);
    return raw ? mergeData(JSON.parse(raw), name) : null;
  } catch {
    return null;
  }
};

export const cleanStart = (name) => ({
  ...defaults,
  profile: { ...defaults.profile, name: name || defaults.profile.name },
  assignments: [],
  tests: [],
  sessions: [],
  streak: 0,
});
