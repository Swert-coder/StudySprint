import { isoToday, daysUntil, dateAfter } from './dates';

// Turns free text like "Chapters 4-6", "Ch. 5–8", "4, 5 and 6" into ['Chapter 4','Chapter 5','Chapter 6'].
// Falls back to treating the whole string as one unit of material when no numbers are found.
export function parseChapters(text) {
  if (!text) return [];
  const t = text.trim();
  if (!t) return [];
  const range = t.match(/(\d+)\s*(?:-|–|—|to)\s*(\d+)/i);
  if (range) {
    const start = parseInt(range[1], 10);
    const end = parseInt(range[2], 10);
    if (end >= start && end - start < 20) {
      return Array.from({ length: end - start + 1 }, (_, i) => `Chapter ${start + i}`);
    }
  }
  const numbers = [...t.matchAll(/\d+/g)].map((m) => parseInt(m[0], 10));
  if (numbers.length > 1) return numbers.map((n) => `Chapter ${n}`);
  if (numbers.length === 1) return [`Chapter ${numbers[0]}`];
  return [t];
}

export const chapterKey = (chapter, phase) => `${chapter}::${phase}`;

// Distributes learn -> practice -> review across the days remaining before the test: every chapter
// is learned first, then every chapter practiced, then every chapter reviewed — spread evenly rather
// than serially, so early study sessions aren't crammed onto chapter 4 while chapter 6 is ignored.
export function buildExamPlan(test, today = isoToday()) {
  const chapters = test.chapters?.length ? test.chapters : parseChapters(test.material || test.topics);
  if (!chapters.length) return null;
  const daysLeft = Math.max(1, daysUntil(test.date, today));
  const phases = ['learn', 'practice', 'review'];
  const totalUnits = chapters.length * phases.length;
  const step = Math.max(1, Math.floor(daysLeft / totalUnits));
  const minutesByPhase = { learn: 30, practice: 25, review: 20 };
  const plan = [];
  let dayCursor = 0;
  for (const phase of phases) {
    for (const chapter of chapters) {
      plan.push({ chapter, phase, date: dateAfter(today, Math.min(daysLeft - 1, dayCursor)), minutes: minutesByPhase[phase] });
      dayCursor += step;
    }
  }
  return plan;
}
