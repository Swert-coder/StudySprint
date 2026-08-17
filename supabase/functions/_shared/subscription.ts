// Shared helpers for every Edge Function that needs to know who is calling and whether they
// currently have StudySprint Pro access. Nothing in this file is ever exposed to the frontend —
// it only runs inside Supabase Edge Functions, using the SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// secrets Supabase injects automatically into every deployed function.

import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export type Feature = 'organizer' | 'syllabus' | 'analyzer' | 'quiz';
export type Plan = 'free' | 'pro';

// Free vs. Pro monthly AI request limits. Tune these here — nothing else needs to change.
export const USAGE_LIMITS: Record<Plan, Record<Feature, number>> = {
  free: { organizer: 8, syllabus: 2, analyzer: 5, quiz: 5 },
  pro: { organizer: 50, syllabus: 10, analyzer: 30, quiz: 30 },
};

const FEATURE_LABELS: Record<Feature, string> = {
  organizer: 'AI Organizer',
  syllabus: 'Syllabus AI processing',
  analyzer: 'AI Analyzer',
  quiz: 'Practice Quiz Maker',
};

export function createAdminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw new Error('Supabase service credentials are not configured on this function.');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Verifies the caller's Supabase session JWT (sent as a Bearer token by supabase.functions.invoke)
// and returns the authenticated user it belongs to — never a user id taken from the request body.
export async function authenticateRequest(req: Request, admin: SupabaseClient): Promise<User | null> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export type SubscriptionStatus = {
  plan: Plan;
  status: string;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

const PRO_STATUSES = new Set(['trialing', 'active']);

// The single authoritative check for "is this user currently a Pro user" — driven entirely by
// what the Stripe webhook last wrote to the database, never by anything the client sent.
export async function getUserSubscriptionStatus(admin: SupabaseClient, userId: string): Promise<SubscriptionStatus> {
  const { data: row } = await admin
    .from('subscriptions')
    .select('status, trial_end, current_period_end, cancel_at_period_end')
    .eq('user_id', userId)
    .maybeSingle();

  if (!row) return { plan: 'free', status: 'none', trialEnd: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };

  return {
    plan: PRO_STATUSES.has(row.status) ? 'pro' : 'free',
    status: row.status,
    trialEnd: row.trial_end,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: !!row.cancel_at_period_end,
  };
}

// Atomically checks + increments this month's usage for one feature via the increment_ai_usage()
// Postgres function, so two concurrent requests can never both slip past the limit.
export async function checkAndConsumeUsage(admin: SupabaseClient, userId: string, feature: Feature, plan: Plan) {
  const limit = USAGE_LIMITS[plan][feature];
  const { data, error } = await admin.rpc('increment_ai_usage', { p_user_id: userId, p_feature: feature, p_limit: limit });
  if (error) throw new Error(`Usage tracking failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: !!row?.allowed, count: row?.current_count ?? 0, limit };
}

export function limitReachedMessage(feature: Feature): string {
  return `You've reached your free ${FEATURE_LABELS[feature]} limit. Upgrade to StudySprint Pro for higher AI usage and unlimited access to advanced StudySprint features.`;
}

// The structured body every Edge Function returns when checkAndConsumeUsage() reports the caller
// is over their monthly limit — the frontend's Paywall component reads `code`/`error`, and the
// extra fields let it (or any future UI) show exactly which feature, how much was used, and
// whether upgrading would even help (a Pro user maxing out their own higher limit is not
// "upgrade eligible" — there's no higher plan to sell them).
export function limitReachedResponse(feature: Feature, plan: Plan, current: number, limit: number) {
  return {
    error: limitReachedMessage(feature),
    code: 'limit_reached' as const,
    feature,
    featureLabel: FEATURE_LABELS[feature],
    plan,
    current,
    limit,
    upgradeEligible: plan === 'free',
  };
}
