import { supabase } from '../supabase';
import { isoToday } from './dates';

// Reads are direct table selects (same pattern app_data already uses) — safe because
// `subscriptions`/`ai_usage` only grant SELECT of the caller's own row (see the migration), and
// nothing here ever writes those tables. Actual Pro access is enforced server-side in the AI
// Edge Functions regardless of what this returns, so this is display-only.
export async function fetchSubscription(userId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, plan, trial_end, current_period_end, cancel_at_period_end, stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error('Could not load your subscription status.');
  return describeSubscription(data);
}

export async function fetchUsage(userId) {
  const period = `${isoToday().slice(0, 7)}-01`;
  const { data, error } = await supabase
    .from('ai_usage')
    .select('organizer_count, syllabus_count, analyzer_count, quiz_count')
    .eq('user_id', userId)
    .eq('period_start', period)
    .maybeSingle();
  if (error) throw new Error('Could not load your usage this month.');
  return {
    organizer: data?.organizer_count || 0,
    syllabus: data?.syllabus_count || 0,
    analyzer: data?.analyzer_count || 0,
    quiz: data?.quiz_count || 0,
  };
}

const PRO_STATUSES = new Set(['trialing', 'active']);

// Turns a raw subscriptions row into what the UI actually needs to show — never used to gate a
// feature, only to display plan/trial/billing state (the AI Edge Functions decide access).
function describeSubscription(row) {
  if (!row) return { plan: 'free', status: 'none', isPro: false, isTrialing: false, trialDaysLeft: 0, currentPeriodEnd: null, cancelAtPeriodEnd: false, hasBillingAccount: false };
  const isPro = PRO_STATUSES.has(row.status);
  const isTrialing = row.status === 'trialing';
  const trialDaysLeft = isTrialing && row.trial_end ? Math.max(0, Math.ceil((new Date(row.trial_end) - new Date()) / 86400000)) : 0;
  return {
    plan: isPro ? 'pro' : 'free',
    status: row.status,
    isPro,
    isTrialing,
    trialDaysLeft,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: !!row.cancel_at_period_end,
    hasBillingAccount: !!row.stripe_customer_id,
  };
}

async function invokeRedirectFunction(name) {
  const { data, error } = await supabase.functions.invoke(name, { body: {} });
  if (error) throw new Error(error.message || 'Could not reach StudySprint billing. Check your connection and try again.');
  if (data?.error) throw new Error(data.error);
  if (!data?.url) throw new Error('Something went wrong starting checkout. Please try again.');
  return data.url;
}

// Redirects the browser to Stripe Checkout to start (or resume) a Pro subscription, including
// the 7-day trial when the account is eligible — eligibility is decided server-side.
export async function startProCheckout() {
  window.location.href = await invokeRedirectFunction('stripe-checkout');
}

// Redirects the browser to the Stripe Billing Portal to manage or cancel an existing subscription.
export async function openBillingPortal() {
  window.location.href = await invokeRedirectFunction('stripe-portal');
}
