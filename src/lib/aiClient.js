import { supabase } from '../supabase';
import { isoToday, daysUntil } from './dates';

// Tags an Error with a machine-readable code (e.g. 'limit_reached') from an Edge Function
// response, so callers can show the Pro paywall instead of a generic error toast.
function withCode(err, code) {
  if (code) err.code = code;
  return err;
}

// Trimmed to what the model actually needs — keeps the prompt small and avoids sending the
// student's entire history for a single natural-language request.
function workloadSnapshot(data, today) {
  const assignments = data.assignments
    .filter((a) => !a.done && daysUntil(a.due, today) <= 14)
    .slice(0, 30)
    .map((a) => ({ id: a.id, title: a.title, course: a.course, due: a.due, minutes: a.minutes, priority: a.priority, difficulty: a.difficulty }));
  const tests = data.tests.slice(0, 10).map((t) => ({ id: t.id, title: t.title, course: t.course, date: t.date, topics: t.topics, studyMinutes: t.studyMinutes }));
  const recentSessions = data.sessions
    .filter((s) => daysUntil(s.date, today) >= -7 && daysUntil(s.date, today) <= 0)
    .slice(0, 20)
    .map((s) => ({ date: s.date, title: s.title, minutes: s.minutes, complete: s.complete }));
  return { assignments, tests, recentSessions };
}

export async function callAssistant(message, data, today = isoToday()) {
  if (!supabase) throw new Error('The AI organizer needs a connected backend to understand open-ended requests.');
  const history = (data.assistant?.history || []).slice(-6).map((m) => ({ role: m.role, text: m.text }));
  const { data: res, error } = await supabase.functions.invoke('ai-assistant', {
    body: {
      message,
      today,
      profile: { gradeLevel: data.profile.gradeLevel, className: data.profile.className, weekdayMinutes: data.profile.weekdayMinutes, dailyGoal: data.profile.dailyGoal },
      workloadSnapshot: workloadSnapshot(data, today),
      history,
    },
  });
  if (error) throw new Error(error.message || 'The AI organizer could not be reached.');
  if (res?.error) throw withCode(new Error(res.error), res.code);
  return res; // { reply, actions }
}

export async function gradeOpenAnswers(questions, studentAnswers, profile) {
  if (!supabase) throw new Error('Grading open-ended answers needs a connected backend.');
  const { data: res, error } = await supabase.functions.invoke('grade-quiz', {
    body: { questions, studentAnswers, profile: { gradeLevel: profile?.gradeLevel, className: profile?.className } },
  });
  if (error) throw new Error(error.message || 'The grader could not be reached.');
  if (res?.error) throw new Error(res.error);
  return res.results; // [{index, correct, feedback}]
}

export async function parseSyllabus(text, today = isoToday()) {
  if (!supabase) throw new Error('Syllabus import needs a connected backend.');
  const { data: res, error } = await supabase.functions.invoke('parse-syllabus', { body: { text, today } });
  if (error) throw new Error(error.message || 'The syllabus reader could not be reached.');
  if (res?.error) throw withCode(new Error(res.error), res.code);
  // The model isn't schema-constrained on array length, so cap defensively.
  return { ...res, items: (res.items || []).slice(0, 80) }; // { className, teacher, term, gradingInfo, items }
}
