export const LEARNING_PREFS = ['Visual', 'Auditory', 'Reading & writing', 'Hands-on'];

export const QUESTION_TYPES = [
  { id: 'multiple-choice', label: 'Multiple choice' },
  { id: 'short-answer', label: 'Short answer' },
  { id: 'long-answer', label: 'Long answer' },
  { id: 'true-false', label: 'True / False' },
];

export const priorityValue = { High: 3, Medium: 2, Low: 1 };
export const difficultyValue = { Hard: 3, Medium: 2, Easy: 1 };

// Same colors as the .high/.medium/.low priority badge text, so the color bar next to an
// assignment or test always means the same thing as its badge — never assigned randomly.
export const PRIORITY_COLORS = { High: '#ff92a4', Medium: '#f0c268', Low: '#6fe0c4' };
export const DIFFICULTY_COLORS = { Hard: '#ff92a4', Medium: '#f0c268', Easy: '#6fe0c4' };
export const priorityColor = (priority) => PRIORITY_COLORS[priority] || PRIORITY_COLORS.Medium;
export const difficultyColor = (difficulty) => DIFFICULTY_COLORS[difficulty] || DIFFICULTY_COLORS.Medium;

// Mirrors USAGE_LIMITS in supabase/functions/_shared/subscription.ts, which is what actually
// enforces these — this copy exists only so the UI can show "N left this month" without a round
// trip. If you change the server-side limits, update this too so the display stays accurate.
export const AI_USAGE_LIMITS = {
  free: { organizer: 8, syllabus: 2, analyzer: 5, quiz: 5 },
  pro: { organizer: 50, syllabus: 10, analyzer: 30, quiz: 30 },
};

export const TIME_BUDGETS = [
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 45, label: '45 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2+ hours' },
];
