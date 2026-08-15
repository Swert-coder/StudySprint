// Learns from completed work over time. Deliberately requires several samples before it changes
// anything — a couple of data points shouldn't be allowed to skew the schedule.
const SUBJECT_SAMPLE_THRESHOLD = 5;
const TYPE_SAMPLE_THRESHOLD = 8;
const HOURLY_INSIGHT_THRESHOLD = 10;

const avg = (nums) => nums.reduce((a, b) => a + b, 0) / nums.length;

// Recomputed from scratch from each item's own estimateHistory rather than tracked incrementally,
// so it can never drift out of sync with the source data.
export function recomputePersonalization(data) {
  const bySubject = {};
  const byType = { assignment: [], test: [] };
  for (const [listKey, type] of [['assignments', 'assignment'], ['tests', 'test']]) {
    for (const item of data[listKey]) {
      for (const h of item.estimateHistory || []) {
        const ratio = h.actualMinutes / Math.max(1, h.estMinutes);
        (bySubject[item.course] ??= []).push(ratio);
        byType[type].push(ratio);
      }
    }
  }
  const subjectEstimates = {};
  for (const [subject, ratios] of Object.entries(bySubject)) {
    subjectEstimates[subject] = { sampleCount: ratios.length, avgRatio: avg(ratios) };
  }
  const typeEstimates = {
    assignment: byType.assignment.length ? { sampleCount: byType.assignment.length, avgRatio: avg(byType.assignment) } : {},
    test: byType.test.length ? { sampleCount: byType.test.length, avgRatio: avg(byType.test) } : {},
  };
  return { ...data.personalization, subjectEstimates, typeEstimates };
}

// Call when a piece of work is completed with a known actual duration (e.g. from a Sprint session
// "this took longer/shorter than expected" report).
export function recordActual(data, sourceType, sourceId, estMinutes, actualMinutes) {
  const listKey = sourceType === 'assignment' ? 'assignments' : 'tests';
  const list = data[listKey];
  const item = list.find((x) => x.id === sourceId);
  if (!item || !actualMinutes) return data;
  const history = [...(item.estimateHistory || []), { estMinutes, actualMinutes, completedAt: new Date().toISOString() }].slice(-20);
  const nextData = { ...data, [listKey]: list.map((x) => (x.id === sourceId ? { ...x, estimateHistory: history } : x)) };
  return { ...nextData, personalization: recomputePersonalization(nextData) };
}

export function recordCompletionHour(data, hour = new Date().getHours()) {
  const key = String(hour);
  const hourlyCompletion = { ...data.personalization.hourlyCompletion, [key]: (data.personalization.hourlyCompletion[key] || 0) + 1 };
  return { ...data, personalization: { ...data.personalization, hourlyCompletion } };
}

// The multiplier the planner applies to a task's remaining minutes. Returns 1 (no change) until
// there's enough reliable history to trust — subject-specific first, then a coarser type fallback.
export function adjustmentFor(personalization, subject, type) {
  const subjectEst = personalization?.subjectEstimates?.[subject];
  if (subjectEst && subjectEst.sampleCount >= SUBJECT_SAMPLE_THRESHOLD) return subjectEst.avgRatio;
  const typeEst = personalization?.typeEstimates?.[type];
  if (typeEst && typeEst.sampleCount >= TYPE_SAMPLE_THRESHOLD) return typeEst.avgRatio;
  return 1;
}

const to12 = (h) => ({ hr: h % 12 === 0 ? 12 : h % 12, period: h < 12 ? 'AM' : 'PM' });

export function bestFocusWindow(personalization) {
  const hourly = personalization?.hourlyCompletion || {};
  const total = Object.values(hourly).reduce((sum, c) => sum + c, 0);
  if (total < HOURLY_INSIGHT_THRESHOLD) return null;
  let best = null;
  for (let h = 0; h < 24; h++) {
    const sum = (hourly[String(h)] || 0) + (hourly[String((h + 1) % 24)] || 0);
    if (!best || sum > best.sum) best = { h, sum };
  }
  if (!best || best.sum === 0) return null;
  const start = to12(best.h);
  const end = to12((best.h + 2) % 24);
  return start.period === end.period ? `${start.hr}–${end.hr} ${end.period}` : `${start.hr} ${start.period} – ${end.hr} ${end.period}`;
}

// Plain-language insights surfaced in Progress.jsx — informational only, separate from the
// scheduling adjustment above (which requires the higher SUBJECT/TYPE thresholds).
export function personalizationInsights(data) {
  const insights = [];
  for (const [subject, est] of Object.entries(data.personalization.subjectEstimates || {})) {
    if (est.sampleCount < SUBJECT_SAMPLE_THRESHOLD) continue;
    if (est.avgRatio >= 1.15) insights.push(`You tend to take longer than estimated on ${subject} work — StudySprint now schedules extra time for it.`);
    else if (est.avgRatio <= 0.85) insights.push(`You tend to finish ${subject} work faster than estimated.`);
  }
  const window = bestFocusWindow(data.personalization);
  if (window) insights.push(`You complete the most work between ${window}.`);
  return insights.slice(0, 4);
}
