// Supabase Edge Function: analyze-work
//
// Receives text already extracted from a student's uploaded PDF/image (never
// the file itself) plus a few self-reported profile fields, and asks Claude
// for study-coach feedback. Requires the ANTHROPIC_API_KEY secret:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy analyze-work
//
// Requires the caller's Supabase session and enforces StudySprint's server-side AI usage limits
// (see supabase/functions/_shared/subscription.ts) before spending an Anthropic call.

import { authenticateRequest, checkAndConsumeUsage, createAdminClient, getUserSubscriptionStatus, limitReachedResponse } from '../_shared/subscription.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_TEXT_LENGTH = 20000;

const SYSTEM_PROMPT = `You are StudySprint's study coach. A student has uploaded a piece of their own schoolwork (an essay, homework set, notes, or a test/quiz), and you are given the text extracted from it plus some context about the student.

Give warm, specific, actionable feedback that helps them study smarter — not a grade, not a diagnosis.

Strict rules:
- Never diagnose, suggest, or speculate about a learning disability, ADHD, dyslexia, or any other medical or clinical condition, even indirectly — that is not your role and could seriously mislead someone.
- If the student shared accommodations they already have (e.g. extended time, chunking, text-to-speech), use that only to tailor how you phrase study suggestions — never to diagnose or explain a cause.
- Base every observation on the actual text provided. Do not invent facts about the student.
- Keep language appropriate to the student's stated grade level.
- Be encouraging but honest — name real weaknesses, not just praise.
- Every array needs 2-5 items, each under 200 characters.`;

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '2-3 sentence overview of what this work shows about where the student is right now' },
    strengths: { type: 'array', items: { type: 'string' }, description: 'Specific strengths grounded in the text' },
    weaknesses: { type: 'array', items: { type: 'string' }, description: 'Specific, constructive weaknesses grounded in the text' },
    difficultTopics: { type: 'array', items: { type: 'string' }, description: 'Short topic or concept names the student is struggling with' },
    studySuggestions: { type: 'array', items: { type: 'string' }, description: 'Specific, actionable study techniques tied to a weakness or difficult topic' },
  },
  required: ['summary', 'strengths', 'weaknesses', 'difficultTopics', 'studySuggestions'],
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
    return json({ error: "The analyzer isn't configured yet — ask your developer to set the ANTHROPIC_API_KEY secret on this Supabase project." }, 500);
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

  const text = String(body?.text || '').trim();
  if (!text) return json({ error: 'No text was extracted from that file.' }, 400);
  const trimmedText = text.slice(0, MAX_TEXT_LENGTH);

  const subscription = await getUserSubscriptionStatus(admin, user.id);
  const usage = await checkAndConsumeUsage(admin, user.id, 'analyzer', subscription.plan);
  if (!usage.allowed) return json(limitReachedResponse('analyzer', subscription.plan, usage.count, usage.limit), 403);

  const profile = body?.profile || {};
  const contextLines = [
    profile.gradeLevel && `Grade level: ${profile.gradeLevel}`,
    profile.className && `Class/subject: ${profile.className}`,
    profile.typicalGrade && `Typical grades in this class: ${profile.typicalGrade}`,
    Array.isArray(profile.learningPreferences) && profile.learningPreferences.length && `Learning preferences: ${profile.learningPreferences.join(', ')}`,
    profile.accommodations && `Accommodations the student already has (self-reported — do not diagnose or question): ${profile.accommodations}`,
  ].filter(Boolean).join('\n');

  const userMessage = `Student context:\n${contextLines || 'No additional context was shared.'}\n\nExtracted text from the uploaded work:\n"""\n${trimmedText}\n"""`;

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
          format: { type: 'json_schema', schema: REPORT_SCHEMA },
        },
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Anthropic API error', res.status, detail);
      return json({ error: 'The AI feedback service had a problem. Please try again shortly.' }, 502);
    }

    const data = await res.json();

    if (data.stop_reason === 'refusal') {
      return json({ error: "The AI declined to analyze this file. If this keeps happening, try uploading a different page or a shorter excerpt." }, 422);
    }

    const raw = data?.content?.find((b: any) => b.type === 'text')?.text || '';
    let report;
    try {
      report = JSON.parse(raw);
    } catch {
      console.error('Could not parse model output as JSON');
      return json({ error: "Couldn't make sense of the AI's response. Please try again." }, 502);
    }

    return json({ report });
  } catch (err) {
    console.error('Unexpected analyzer error', err);
    return json({ error: 'Something went wrong analyzing this file. Please try again.' }, 500);
  }
});
