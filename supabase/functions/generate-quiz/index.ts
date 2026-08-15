// Supabase Edge Function: generate-quiz
//
// Receives text already extracted from a student's uploaded PDF/image (or
// pasted directly), plus which question types and how many questions to
// generate, and asks Claude to build a practice quiz from it. Uses the same
// ANTHROPIC_API_KEY secret as analyze-work:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy generate-quiz

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_TEXT_LENGTH = 20000;
const MAX_QUESTIONS = 20;
const VALID_TYPES = ['multiple-choice', 'short-answer', 'long-answer', 'true-false'];

const SYSTEM_PROMPT = `You are StudySprint's quiz generator. A student has provided study material (from their own notes, textbook excerpt, or uploaded work) plus which question types they want and how many questions to generate.

Create a quiz that tests real understanding of the material provided — every question must be answerable from the given text.

Strict rules:
- Only use the question types the student selected.
- Multiple-choice questions need exactly 4 options in the "options" array, with exactly one correct answer stated in "answer" that matches one option exactly. For every other question type, "options" must be an empty array.
- True/false questions must have "answer" be exactly "True" or "False", with "options" as an empty array.
- Short-answer questions expect a brief factual answer (a phrase or sentence).
- Long-answer questions expect a multi-sentence model answer covering the key points.
- Always include a one-sentence "explanation" of why the answer is correct.
- Base every question on the actual text provided. Do not invent facts not supported by the material.
- Keep language appropriate to the student's stated grade level, if given.
- Never diagnose, suggest, or speculate about a learning disability, ADHD, dyslexia, or any other medical or clinical condition.`;

const QUIZ_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: VALID_TYPES, description: 'The question type' },
          question: { type: 'string', description: 'The question text' },
          options: { type: 'array', items: { type: 'string' }, description: 'Exactly 4 options for multiple-choice questions; an empty array for every other type' },
          answer: { type: 'string', description: 'The correct answer' },
          explanation: { type: 'string', description: 'One sentence on why this is the answer' },
          topic: { type: 'string', description: 'A short topic or concept name this question tests, used to group weak areas in the results screen' },
        },
        required: ['type', 'question', 'options', 'answer', 'explanation', 'topic'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json({ error: "The quiz generator isn't configured yet — ask your developer to set the ANTHROPIC_API_KEY secret on this Supabase project." }, 500);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const text = String(body?.text || '').trim();
  if (!text) return json({ error: 'No text was provided to generate a quiz from.' }, 400);
  const trimmedText = text.slice(0, MAX_TEXT_LENGTH);

  const types = Array.isArray(body?.types) ? body.types.filter((t: unknown) => VALID_TYPES.includes(String(t))) : [];
  if (!types.length) return json({ error: 'Choose at least one question type.' }, 400);

  const count = Math.min(MAX_QUESTIONS, Math.max(1, parseInt(body?.count, 10) || 5));
  const difficulty = ['Easy', 'Medium', 'Hard'].includes(body?.difficulty) ? body.difficulty : null;

  const profile = body?.profile || {};
  const contextLines = [
    profile.gradeLevel && `Grade level: ${profile.gradeLevel}`,
    profile.className && `Class/subject: ${profile.className}`,
    difficulty && `Target difficulty: ${difficulty}`,
  ].filter(Boolean).join('\n');

  const userMessage = `Question types to use: ${types.join(', ')}\nNumber of questions: ${count}\n\nStudent context:\n${contextLines || 'No additional context was shared.'}\n\nSource material:\n"""\n${trimmedText}\n"""`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        output_config: {
          effort: 'medium',
          format: { type: 'json_schema', schema: QUIZ_SCHEMA },
        },
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Anthropic API error', res.status, detail);
      return json({ error: 'The quiz service had a problem. Please try again shortly.' }, 502);
    }

    const data = await res.json();

    if (data.stop_reason === 'refusal') {
      return json({ error: "The AI declined to generate a quiz from this text. Try a different excerpt." }, 422);
    }

    const raw = data?.content?.find((b: any) => b.type === 'text')?.text || '';
    let quiz;
    try {
      quiz = JSON.parse(raw);
    } catch {
      console.error('Could not parse model output as JSON');
      return json({ error: "Couldn't make sense of the AI's response. Please try again." }, 502);
    }

    return json({ quiz });
  } catch (err) {
    console.error('Unexpected quiz generator error', err);
    return json({ error: 'Something went wrong generating this quiz. Please try again.' }, 500);
  }
});
