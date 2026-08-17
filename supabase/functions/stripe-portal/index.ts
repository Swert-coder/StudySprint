// Supabase Edge Function: stripe-portal
//
// Creates a Stripe Billing Portal session so an authenticated StudySprint user can manage or
// cancel their subscription (Stripe's own hosted UI — update card, view invoices, cancel).
// Requires the same secrets as stripe-checkout:
//   supabase secrets set STRIPE_SECRET_KEY=sk_test_... APP_URL=https://your-app-url
//   supabase functions deploy stripe-portal

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
  if (!secretKey) {
    return json({ error: "Subscriptions aren't configured yet — ask your developer to set STRIPE_SECRET_KEY." }, 500);
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return json({ error: 'Subscriptions are temporarily unavailable. Please try again shortly.' }, 500);
  }

  const user = await authenticateRequest(req, admin);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  const appUrl = (Deno.env.get('APP_URL') || req.headers.get('origin') || '').replace(/\/$/, '');
  if (!appUrl) return json({ error: "Couldn't determine where to send you back. Ask your developer to set APP_URL." }, 500);

  const { data: row } = await admin.from('subscriptions').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
  if (!row?.stripe_customer_id) return json({ error: 'Start a subscription first to manage billing.' }, 400);

  const stripe = new Stripe(secretKey, { apiVersion: '2026-07-29.dahlia', httpClient: Stripe.createFetchHttpClient() });

  try {
    const portal = await stripe.billingPortal.sessions.create({ customer: row.stripe_customer_id, return_url: `${appUrl}/` });
    return json({ url: portal.url });
  } catch (err) {
    console.error('stripe-portal error', err);
    return json({ error: 'Could not open the billing portal. Please try again shortly.' }, 502);
  }
});
