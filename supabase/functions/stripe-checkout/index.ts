// Supabase Edge Function: stripe-checkout
//
// Creates a Stripe Checkout Session (subscription mode) for the authenticated StudySprint user
// and returns its URL for the client to redirect to. Reuses the caller's existing Stripe customer
// if one exists, and grants the 7-day trial only the first time this user ever checks out — that
// eligibility is read from our own database, not from anything the client sends, so it can't be
// reset by clearing localStorage/cookies. Requires:
//   supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_PRICE_ID_PRO=price_... APP_URL=https://your-app-url
//   supabase functions deploy stripe-checkout

import Stripe from 'npm:stripe@22';
import { authenticateRequest, createAdminClient } from '../_shared/subscription.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'content-type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const priceId = Deno.env.get('STRIPE_PRICE_ID_PRO');
  if (!secretKey || !priceId) {
    return json({ error: "Subscriptions aren't configured yet — ask your developer to set STRIPE_SECRET_KEY and STRIPE_PRICE_ID_PRO." }, 500);
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return json({ error: 'Subscriptions are temporarily unavailable. Please try again shortly.' }, 500);
  }

  const user = await authenticateRequest(req, admin);
  if (!user || !user.email) return json({ error: 'Please sign in again to start a subscription.' }, 401);

  const appUrl = (Deno.env.get('APP_URL') || req.headers.get('origin') || '').replace(/\/$/, '');
  if (!appUrl) return json({ error: "Couldn't determine where to send you back after checkout. Ask your developer to set APP_URL." }, 500);

  const stripe = new Stripe(secretKey, { apiVersion: '2026-07-29.dahlia', httpClient: Stripe.createFetchHttpClient() });

  try {
    const { data: existing } = await admin
      .from('subscriptions')
      .select('stripe_customer_id, trial_start')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { supabase_user_id: user.id } });
      customerId = customer.id;
      const { error: upsertError } = await admin
        .from('subscriptions')
        .upsert({ user_id: user.id, stripe_customer_id: customerId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (upsertError) throw new Error(`Could not save Stripe customer: ${upsertError.message}`);
    }

    const eligibleForTrial = !existing?.trial_start;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { supabase_user_id: user.id },
        ...(eligibleForTrial ? { trial_period_days: 7 } : {}),
      },
      allow_promotion_codes: true,
      success_url: `${appUrl}/?checkout=success`,
      cancel_url: `${appUrl}/?checkout=cancel`,
    });

    if (!session.url) throw new Error('Stripe did not return a checkout URL.');
    return json({ url: session.url });
  } catch (err) {
    console.error('stripe-checkout error', err);
    return json({ error: 'Could not start checkout. Please try again shortly.' }, 502);
  }
});
