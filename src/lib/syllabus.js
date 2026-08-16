import { isoToday, daysUntil } from './dates';
import { confidentMatch } from './fuzzy';
import { parseChapters, buildExamPlan } from './examCountdown';

export const SYLLABUS_TYPES = [
  { id: 'assignment', label: 'Assignment' },
  { id: 'test', label: 'Test' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'project', label: 'Project' },
  { id: 'reading', label: 'Reading' },
  { id: 'deadline', label: 'Deadline' },
  { id: 'no-school', label: 'No school' },
];

const MINUTES_BY_TYPE = { project: 90, reading: 30, deadline: 30, assignment: 45 };

// Flags a likely-existing duplicate so the review screen can default it to excluded rather than
// re-adding something already on the student's plan. Title match (same course only) is required;
// when both sides have a date, it must also be within 2 days, so "Homework 1"/"Homework 2" in the
// same class don't collide just because their titles are similar.
export function findLikelyDuplicate(existingList, title, date, dateField, className) {
  const sameCourse = existingList.filter((x) => (x.course || '').trim().toLowerCase() === className.trim().toLowerCase());
  const match = confidentMatch(sameCourse, title, []);
  if (!match) return null;
  if (date && match[dateField]) {
    return Math.abs(daysUntil(match[dateField], date)) <= 2 ? match : null;
  }
  return match;
}

// Turns the approved (edited) review-screen items into real assignments/tests/blocked-dates and
// merges them into the student's data. `items` are already filtered to only the ones the student
// checked, each shaped like { type, title, date, notes }.
export function applySyllabusImport(data, meta, items, today = isoToday()) {
  let idCounter = Date.now();
  const nextId = () => idCounter++;

  const assignments = [...data.assignments];
  const tests = [...data.tests];
  const blockedDates = new Set(data.profile.blockedDates || []);
  let addedAssignments = 0;
  let addedTests = 0;
  let addedBlocked = 0;

  for (const item of items) {
    if (item.type === 'no-school') {
      if (item.date && !blockedDates.has(item.date)) { blockedDates.add(item.date); addedBlocked++; }
      continue;
    }
    if (!item.title?.trim() || !item.date) continue;

    if (item.type === 'test' || item.type === 'quiz') {
      const chapters = parseChapters(item.notes);
      const test = {
        id: nextId(), title: item.title.trim(), course: meta.className, date: item.date,
        topics: item.notes || item.rawDateText || '', material: item.notes || '',
        chapters, studyMinutes: 120, difficulty: 'Medium', source: 'syllabus',
      };
      test.chapterPlan = chapters.length ? buildExamPlan(test, today) : null;
      tests.push(test);
      addedTests++;
    } else {
      assignments.push({
        id: nextId(), title: item.title.trim(), course: meta.className, due: item.date,
        minutes: MINUTES_BY_TYPE[item.type] || 45, priority: 'Medium', difficulty: 'Medium',
        material: item.notes || '', done: false, source: 'syllabus',
      });
      addedAssignments++;
    }
  }

  const nextData = {
    ...data, assignments, tests,
    profile: { ...data.profile, blockedDates: [...blockedDates].sort() },
    syllabi: [
      { id: nextId(), className: meta.className, teacher: meta.teacher, term: meta.term, uploadedAt: new Date().toISOString(), itemCount: addedAssignments + addedTests + addedBlocked },
      ...(data.syllabi || []),
    ].slice(0, 20),
  };

  return { data: nextData, addedAssignments, addedTests, addedBlocked };
}
