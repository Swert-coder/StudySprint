import { isoToday, dateAfter, daysUntil, nextWeekdayDate } from './dates';
import { buildPlannerTasks, whatShouldIDoNow } from './planner';
import { confidentMatch } from './fuzzy';

const FRACTION_WORDS = { all: 1, everything: 1, most: 0.75, half: 0.5, some: 0.25, 'a little': 0.2 };

function overdueReply(data, today) {
  const overdue = buildPlannerTasks(data, today).filter((t) => daysUntil(t.due, today) < 0);
  if (!overdue.length) return "You're all caught up — nothing overdue.";
  const names = [...new Set(overdue.map((t) => t.title))].slice(0, 4);
  return `You're behind on: ${names.join(', ')}${overdue.length > names.length ? ', and more' : ''}.`;
}

function mostImportantReply(data, today) {
  const { picks } = whatShouldIDoNow(data, 999, today);
  if (!picks.length) return "You're all caught up — nothing urgent right now.";
  const top = picks[0];
  return `Right now, the highest-priority thing is "${top.title}" — ${top.reason.toLowerCase()}.`;
}

// Runs before any network call. Returns null to escalate to the AI edge function, or one of:
//   { kind: 'action', action: {type, payload, requiresConfirmation} }
//   { kind: 'reply', reply }          — answered entirely client-side, no mutation
//   { kind: 'panic' }                 — opens the Panic Mode time-budget prompt
export function matchLocalCommand(text, data, today = isoToday()) {
  const t = text.trim().toLowerCase();
  if (!t) return null;

  if (/overwhelm|i'?m screwed|too much (going on|work|to do)/i.test(t)) return { kind: 'panic' };

  if (/what.*(behind|overdue)/i.test(t)) return { kind: 'reply', reply: overdueReply(data, today) };
  if (/(most important|what should i do)(?!.*\d)/i.test(t) && !/minutes|hour/i.test(t)) {
    return { kind: 'reply', reply: mostImportantReply(data, today) };
  }

  const everythingMove = t.match(/move everything from today to (tomorrow|\w+day)/i);
  if (everythingMove) {
    const target = everythingMove[1].toLowerCase();
    const toDate = target === 'tomorrow' ? dateAfter(today, 1) : nextWeekdayDate(target, today);
    if (toDate) return { kind: 'action', action: { type: 'move_sessions', requiresConfirmation: true, payload: { scope: 'today', toDate } } };
  }

  if (/can'?t study (tonight|today)/i.test(t)) {
    return { kind: 'action', action: { type: 'block_date', requiresConfirmation: false, payload: { date: today } } };
  }
  const cantStudyDay = t.match(/can'?t study (?:on )?(\w+day)/i);
  if (cantStudyDay) {
    const date = nextWeekdayDate(cantStudyDay[1], today);
    if (date) return { kind: 'action', action: { type: 'block_date', requiresConfirmation: false, payload: { date } } };
  }

  const timeBudget = t.match(/i have (\d+(?:\.\d+)?)\s*(min|mins|minutes|hour|hours|hr|hrs)\s*(tonight|today|tomorrow)/i);
  if (timeBudget) {
    const amount = parseFloat(timeBudget[1]);
    const minutes = Math.round(/^h/.test(timeBudget[2]) ? amount * 60 : amount);
    const date = timeBudget[3].toLowerCase() === 'tomorrow' ? dateAfter(today, 1) : today;
    return { kind: 'action', action: { type: 'set_day_available_minutes', requiresConfirmation: false, payload: { date, minutes } } };
  }

  const fractionFinish = t.match(/i(?:'ve| have)? finished (all|everything|most|half|some|a little)(?: of)? (?:my )?(.+)/i);
  if (fractionFinish) {
    const fractionDone = FRACTION_WORDS[fractionFinish[1].toLowerCase()] ?? 1;
    const target = confidentMatch(data.assignments.filter((a) => !a.done), fractionFinish[2], ['course']);
    if (target) return { kind: 'action', action: { type: 'update_progress', requiresConfirmation: false, payload: { id: target.id, fractionDone } } };
  }

  const plainFinish = t.match(/i(?:'ve| have)? finished (?:my )?(.+)/i);
  if (plainFinish) {
    const target = confidentMatch(data.assignments.filter((a) => !a.done), plainFinish[1], ['course']);
    if (target) return { kind: 'action', action: { type: 'mark_complete', requiresConfirmation: false, payload: { targetType: 'assignment', id: target.id } } };
  }

  const markComplete = t.match(/mark (?:my )?(.+?) (?:as )?(?:complete|done|finished)\b/i);
  if (markComplete) {
    const target = confidentMatch(data.assignments.filter((a) => !a.done), markComplete[1], ['course']);
    if (target) return { kind: 'action', action: { type: 'mark_complete', requiresConfirmation: false, payload: { targetType: 'assignment', id: target.id } } };
  }

  return null;
}
