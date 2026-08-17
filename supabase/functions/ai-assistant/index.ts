// Supabase Edge Function: ai-assistant
//
// StudySprint's AI Organizer. Receives a natural-language message plus a trimmed snapshot of the
// student's current workload (never their whole saved state) and asks Claude to reply and/or emit
// structured actions the client applies through src/lib/actions.js. Uses the same ANTHROPIC_API_KEY
// secret as analyze-work/generate-quiz:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy ai-assistant
//
// Requires the caller's Supabase session and enforces StudySprint's server-side AI usage limits
// (see supabase/functions/_shared/subscription.ts) before spending an Anthropic call.

import { authenticateRequest, checkAndConsumeUsage, createAdminClient, getUserSubscriptionStatus, limitReachedMessage } from '../_shared/subscription.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_MESSAGE_LENGTH = 2000;
const ACTION_TYPES = [
  'create_assignment', 'create_test', 'delete_test', 'mark_complete', 'update_progress', 'move_sessions',
  'block_date', 'unblock_date', 'set_day_available_minutes', 'set_weekday_schedule',
  'answer_query', 'rebuild_plan', 'panic_mode',
];

const SYSTEM_PROMPT = `You are StudySprint's AI Organizer — the control center for a student's workload. You understand natural language and turn it into structured actions on their study plan, or answer questions about it directly, using the workload snapshot you're given.

Today's date is provided as "today" (YYYY-MM-DD). Resolve all relative dates ("tomorrow", "next Thursday", "Friday") against it and always output dates as YYYY-MM-DD.

Respond with a short, warm, natural confirmation in "reply" (e.g. "Got it — Biology test next Thursday. I've created a study plan for Chapters 4–6.") and zero or more "actions".

Action types and their payload shape:
- create_assignment: { title, course, due, minutes (estimate), priority (Low/Medium/High), difficulty (Easy/Medium/Hard), material (chapters/pages/problem numbers, optional) }
- create_test: { title, course, date, topics, material (e.g. "Chapters 4-6"), studyMinutes (total prep time estimate), difficulty }
- delete_test: { titleMatch } — removes a test and its scheduled study sessions
- mark_complete: { targetType: 'assignment'|'test'|'session', titleMatch (best-guess title/subject text to find it) }
- update_progress: { titleMatch, fractionDone (0-1) } — for "I finished half of my essay"
- move_sessions: { scope: 'today'|'date'|'session', fromDate, toDate, titleMatch (only if scope is 'session') }
- block_date: { date } — the student can't study that day at all
- unblock_date: { date }
- set_day_available_minutes: { date, minutes } — e.g. "I have practice until 6:30" reduces today's remaining minutes
- set_weekday_schedule: { weekdayMinutes: { Mon, Tue, Wed, Thu, Fri, Sat, Sun: minutes } }
- answer_query: {} — for questions like "what am I behind on", "what's most important", or "how should I prepare for my test" — put the real answer in "reply" using the workload snapshot. No payload fields needed.
- rebuild_plan: {} — general "rebuild my schedule" requests with no other change
- panic_mode: { availableMinutes } — "I'm overwhelmed" with a stated time budget

"payload" always contains every field listed above, never omitted — for whichever ones an action type doesn't use, set string fields to "" and number fields to 0.

Rules:
- If the student is creating an assignment or test and required info (what it is, subject, a due date) is missing, return an EMPTY actions array and ask only for the specific missing piece in "reply". Never demand information you don't need, and never invent a due date, subject, or time estimate that wasn't stated or clearly implied.
- Before proposing create_assignment or create_test, check the workload snapshot — if an item with essentially the same title/subject/date already exists, don't create a duplicate; say it's already on the plan instead (or use delete_test/mark_complete if the student is asking to change or remove it).
- For "how should I prepare for my test" style questions, answer directly and specifically using the matching test from the workload snapshot, with action type answer_query.
- Keep "reply" to at most 3 sentences.
- Never diagnose or speculate about a learning disability, ADHD, or any medical/clinical condition.
- requiresConfirmation should be true for anything that creates new work or moves/changes more than one item at once, false for a single well-identified change or a read-only answer.`;

// Anthropic's structured-output mode requires every object fully enumerated with
// additionalProperties:false — no true free-form objects, and no `type: [x, 'null']` unions combined
// with `enum` (confirmed by testing: it rejects that combination outright). So `payload` is a flat
// superset of every field any action type might use, all plain string/number, with an empty string
// or 0 as the "not applicable to this action" sentinel instead of null.
const STR = (description) => ({ type: 'string', description });
const NUM = (description) => ({ type: 'number', description });
const WEEKDAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const PAYLOAD_SCHEMA = {
  type: 'object',
  properties: {
    title: STR('empty string if not applicable'),
    course: STR('empty string if not applicable'),
    due: STR('YYYY-MM-DD for create_assignment, empty string if not applicable'),
    date: STR('YYYY-MM-DD for create_test/block_date/unblock_date/set_day_available_minutes, empty string if not applicable'),
    minutes: NUM('estimate for create_assignment, or the value for set_day_available_minutes, 0 if not applicable'),
    priority: { type: 'string', enum: ['Low', 'Medium', 'High', ''], description: "empty string if not applicable" },
    difficulty: { type: 'string', enum: ['Easy', 'Medium', 'Hard', ''], description: "empty string if not applicable" },
    material: STR('chapters/pages/problem numbers, empty string if not applicable'),
    topics: STR('empty string if not applicable'),
    studyMinutes: NUM('0 if not applicable'),
    targetType: { type: 'string', enum: ['assignment', 'test', 'session', ''], description: "empty string if not applicable" },
    titleMatch: STR('best-guess title/subject text to find the item, empty string if not applicable'),
    fractionDone: NUM('0-1, for update_progress, 0 if not applicable'),
    scope: { type: 'string', enum: ['today', 'date', 'session', ''], description: "empty string if not applicable" },
    fromDate: STR('empty string if not applicable'),
    toDate: STR('empty string if not applicable'),
    weekdayMinutes: {
      type: 'object',
      description: 'only meaningful for set_weekday_schedule — otherwise all zeros',
      properties: Object.fromEntries(WEEKDAY_KEYS.map((k) => [k, NUM('minutes available that day, 0 if not applicable')])),
      required: WEEKDAY_KEYS,
      additionalProperties: false,
    },
    availableMinutes: NUM('for panic_mode, 0 if not applicable'),
  },
  required: ['title', 'course', 'due', 'date', 'minutes', 'priority', 'difficulty', 'material', 'topics', 'studyMinutes', 'targetType', 'titleMatch', 'fractionDone', 'scope', 'fromDate', 'toDate', 'weekdayMinutes', 'availableMinutes'],
  additionalProperties: false,
};

const ACTION_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: "Natural-language reply shown to the student" },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ACTION_TYPES },
          requiresConfirmation: { type: 'boolean' },
          payload: PAYLOAD_SCHEMA,
        },
        required: ['type', 'requiresConfirmation', 'payload'],
        additionalProperties: false,
      },
    },
  },
  required: ['reply', 'actions'],
  additionalProperties: false,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'content-type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json({ error: "The AI organizer isn't configured yet — ask your developer to set the ANTHROPIC_API_KEY secret on this Supabase project." }, 500);
  }

  const admin = createAdminClient();
  const user = await authenticateRequest(req, admin);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const message = String(body?.message || '').trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!message) return json({ error: 'No message was provided.' }, 400);

  const subscription = await getUserSubscriptionStatus(admin, user.id);
  const usage = await checkAndConsumeUsage(admin, user.id, 'organizer', subscription.plan);
  if (!usage.allowed) return json({ error: limitReachedMessage('organizer'), code: 'limit_reached' }, 403);

  const today = String(body?.today || new Date().toISOString().slice(0, 10));
  const profile = body?.profile || {};
  const snapshot = body?.workloadSnapshot || {};
  const history = Array.isArray(body?.history) ? body.history.slice(-6) : [];

  const contextLines = [
    profile.gradeLevel && `Grade level: ${profile.gradeLevel}`,
    profile.className && `Class/subject: ${profile.className}`,
    profile.dailyGoal && `Default daily study goal: ${profile.dailyGoal} minutes`,
    profile.weekdayMinutes && `Per-weekday available minutes: ${JSON.stringify(profile.weekdayMinutes)}`,
  ].filter(Boolean).join('\n');

  const historyText = history.length
    ? history.map((h: any) => `${h.role === 'user' ? 'Student' : 'StudySprint'}: ${String(h.text || '').slice(0, 400)}`).join('\n')
    : 'No prior conversation.';

  const userMessage = `Today: ${today}

Student context:
${contextLines || 'No additional context shared.'}

Workload snapshot (assignments, tests, recent sessions — JSON):
${JSON.stringify(snapshot).slice(0, 8000)}

Recent conversation:
${historyText}

New message from the student:
"""
${message}
"""`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: ACTION_SCHEMA } },
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Anthropic API error', res.status, detail);
      return json({ error: 'The AI organizer had a problem. Please try again shortly.' }, 502);
    }

    const data = await res.json();
    if (data.stop_reason === 'refusal') {
      return json({ error: "The AI organizer declined to respond to that. Try rephrasing it." }, 422);
    }

    const raw = data?.content?.find((b: any) => b.type === 'text')?.text || '';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('Could not parse model output as JSON');
      return json({ error: "Couldn't make sense of the AI's response. Please try again." }, 502);
    }

    return json(parsed);
  } catch (err) {
    console.error('Unexpected ai-assistant error', err);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
