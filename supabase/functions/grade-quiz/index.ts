// Supabase Edge Function: grade-quiz
//
// Grades the short-answer/long-answer questions from a completed Practice Quiz — multiple-choice
// and true/false are graded client-side by exact match, so this only ever needs to handle the
// open-ended subset, in one batched call per quiz submission. Uses the same ANTHROPIC_API_KEY
// secret as analyze-work/generate-quiz/ai-assistant:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy grade-quiz

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OPEN_TYPES = ['short-answer', 'long-answer'];
const MAX_ITEMS = 20;

const SYSTEM_PROMPT = `You are grading a student's practice quiz answers. For each question, decide if the student's answer demonstrates correct understanding compared to the model answer — be reasonably lenient about phrasing, strict about factual accuracy. Give one short sentence of feedback per question. Never diagnose or speculate about a learning disability or any medical/clinical condition.`;

const GRADE_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: 'The index of this question in the submitted list' },
          correct: { type: 'boolean' },
          feedback: { type: 'string', description: 'One short sentence of feedback' },
        },
        required: ['index', 'correct', 'feedback'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
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
    return json({ error: "The grader isn't configured yet — ask your developer to set the ANTHROPIC_API_KEY secret on this Supabase project." }, 500);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const questions = Array.isArray(body?.questions) ? body.questions : [];
  const studentAnswers = Array.isArray(body?.studentAnswers) ? body.studentAnswers : [];
  const openItems = questions
    .map((q: any, index: number) => ({ index, question: q?.question, answer: q?.answer, type: q?.type, studentAnswer: studentAnswers[index] ?? '' }))
    .filter((q: any) => OPEN_TYPES.includes(q.type))
    .slice(0, MAX_ITEMS);

  if (!openItems.length) return json({ results: [] });

  const profile = body?.profile || {};
  const contextLines = [profile.gradeLevel && `Grade level: ${profile.gradeLevel}`, profile.className && `Class/subject: ${profile.className}`].filter(Boolean).join('\n');

  const userMessage = `Student context:\n${contextLines || 'No additional context shared.'}\n\nQuestions to grade (JSON, "answer" is the model answer, "studentAnswer" is what the student wrote):\n${JSON.stringify(openItems)}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: GRADE_SCHEMA } },
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Anthropic API error', res.status, detail);
      return json({ error: 'The grader had a problem. Please try again shortly.' }, 502);
    }

    const data = await res.json();
    if (data.stop_reason === 'refusal') return json({ error: 'The AI declined to grade this quiz.' }, 422);

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
    console.error('Unexpected grade-quiz error', err);
    return json({ error: 'Something went wrong grading this quiz. Please try again.' }, 500);
  }
});
