// Supabase Edge Function: parse-syllabus
//
// Receives text already extracted from a student's uploaded syllabus (PDF/image/pasted text, never
// the file itself) and asks Claude to pull out the class name, teacher, and every dated academic
// item (assignments, tests, quizzes, projects, readings, deadlines, no-school days) so the client
// can show a review screen before anything is added to the plan. Uses the same ANTHROPIC_API_KEY
// secret as the other StudySprint AI functions:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy parse-syllabus

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_TEXT_LENGTH = 20000;
const ITEM_TYPES = ['assignment', 'test', 'quiz', 'project', 'reading', 'deadline', 'no-school'];

const SYSTEM_PROMPT = `You are StudySprint's syllabus reader. Given the extracted text of a course syllabus and today's date, extract structured academic information a student can use to build their study plan. This is read-only extraction — nothing is added to the student's plan until they review and approve it themselves, so be thorough rather than conservative about what you surface.

Extract:
- className: the course/class name or number (e.g. "AP Biology", "MATH 201"), not the school's name
- teacher: the instructor's name if stated, else ""
- term: the semester/term if stated (e.g. "Fall 2026"), else ""
- gradingInfo: a brief 1-2 sentence summary of the grading breakdown/policy if the syllabus states one, else ""
- items: every dated academic item you can find — assignments, tests, quizzes, projects, reading assignments, major deadlines, and no-school/no-class dates (holidays, breaks, or any day explicitly marked as no class)

For each item, output:
- type: one of assignment, test, quiz, project, reading, deadline, no-school — pick the closest fit (a lab report is "assignment", a presentation is "project", a final exam is "test")
- title: a short descriptive name (e.g. "Midterm Exam", "Chapter 5 Reading", "No class — Thanksgiving Break")
- date: YYYY-MM-DD if you can determine an actual calendar date from the text (use "today" to resolve years or relative references like "Week 3" if the syllabus states its own start date) — if you genuinely cannot determine a real date, output ""
- rawDateText: the original date/timing text exactly as written in the syllabus (e.g. "Week of Oct 12", "TBD"), always populate this even when you resolved a real date
- notes: brief extra detail — chapters/pages/topics covered, point value, etc. — "" if there's nothing extra

Rules:
- Only extract items actually present in the syllabus text. Never invent assignments, dates, teacher names, or grading details that aren't stated.
- If the syllabus describes a recurring pattern (e.g. "reading response due every Monday") without listing specific dates, extract it as ONE item describing the pattern in notes — don't guess every individual occurrence.
- A no-school item that spans a multi-day range (e.g. "Nov 27-28", "Dec 20 - Jan 2 Winter Break") must be expanded into one separate no-school item per calendar day in that range, each with the same title and its own date — a single item can only ever hold one date, so a 2-day break needs 2 items, a week-long break needs one item per day of that week.
- If the text doesn't look like a syllabus at all (e.g. it's blank or unrelated), return an empty items array and empty className/teacher/term/gradingInfo rather than guessing.`;

const SYLLABUS_SCHEMA = {
  type: 'object',
  properties: {
    className: { type: 'string' },
    teacher: { type: 'string' },
    term: { type: 'string' },
    gradingInfo: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ITEM_TYPES },
          title: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD, empty string if not determinable' },
          rawDateText: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['type', 'title', 'date', 'rawDateText', 'notes'],
        additionalProperties: false,
      },
    },
  },
  required: ['className', 'teacher', 'term', 'gradingInfo', 'items'],
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
    return json({ error: "The syllabus reader isn't configured yet — ask your developer to set the ANTHROPIC_API_KEY secret on this Supabase project." }, 500);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const text = String(body?.text || '').trim();
  if (!text) return json({ error: 'No text was extracted from that syllabus.' }, 400);
  const trimmedText = text.slice(0, MAX_TEXT_LENGTH);
  const today = String(body?.today || new Date().toISOString().slice(0, 10));

  const userMessage = `Today: ${today}\n\nSyllabus text:\n"""\n${trimmedText}\n"""`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SYLLABUS_SCHEMA } },
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Anthropic API error', res.status, detail);
      return json({ error: 'The syllabus reader had a problem. Please try again shortly.' }, 502);
    }

    const data = await res.json();
    if (data.stop_reason === 'refusal') {
      return json({ error: 'The AI declined to read this file. Try uploading a different page or a shorter excerpt.' }, 422);
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
    console.error('Unexpected parse-syllabus error', err);
    return json({ error: 'Something went wrong reading this syllabus. Please try again.' }, 500);
  }
});
