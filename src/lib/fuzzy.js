// Lightweight fuzzy title matching used by the local command matcher and the AI action resolver —
// no fuzzy-matching library needed for a handful of assignment/test/session titles per student.
export function fuzzyMatch(items, query, extraKeys = []) {
  const q = (query || '').toLowerCase().trim();
  if (!q) return [];
  const qTokens = q.split(/\s+/).filter(Boolean);
  return items
    .map((item) => {
      const haystacks = [item.title, ...extraKeys.map((k) => item[k])].filter(Boolean).map((s) => String(s).toLowerCase());
      let score = 0;
      for (const hay of haystacks) {
        if (hay === q) score = Math.max(score, 1);
        else if (hay.includes(q) || q.includes(hay)) score = Math.max(score, 0.8);
        else {
          const hayTokens = hay.split(/\s+/);
          const overlap = qTokens.filter((t) => hayTokens.some((h) => h.includes(t) || t.includes(h))).length;
          score = Math.max(score, overlap / Math.max(qTokens.length, hayTokens.length));
        }
      }
      return { item, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

// Returns a single item only when the match is unambiguous — ties or low-confidence matches
// return null so the caller can escalate rather than guess.
export function confidentMatch(items, query, extraKeys = [], threshold = 0.6) {
  const scored = fuzzyMatch(items, query, extraKeys);
  if (!scored.length || scored[0].score < threshold) return null;
  if (scored.length > 1 && scored[1].item !== scored[0].item && scored[1].score >= scored[0].score - 0.05) return null;
  return scored[0].item;
}
