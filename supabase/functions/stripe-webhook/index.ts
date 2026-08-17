// Supabase Edge Function: stripe-webhook
//
// The only thing that ever marks a StudySprint user as Pro. Verifies Stripe's signature, dedupes
// by event id so retried/duplicate deliveries never double-apply, and syncs public.subscriptions
// from the subscription object on every relevant event. Stripe calls this directly (no Supabase
// session), so it's configured with verify_jwt = false in supabase/config.toml. Requires:
//   supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_...
//   supabase functions deploy stripe-webhook

import Stripe from 'npm:stripe@17';
import { createAdminClient } from '../_shared/subscription.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const planForStatus = (status: string) => (['trialing', 'active'].includes(status) ? 'pro' : 'free');

async function upsertFromSubscription(admin: ReturnType<typeof createAdminClient>, sub: Stripe.Subscription, fallbackUserId?: string | null) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  let userId = (sub.metadata?.supabase_user_id as string | undefined) || fallbackUserId || undefined;

  if (!userId) {
    const { data: row } = await admin.from('subscriptions').select('user_id').eq('stripe_customer_id', customerId).maybeSingle();
    userId = row?.user_id;
  }
  if (!userId) {
    console.error('stripe-webhook: no StudySprint user found for Stripe customer', customerId);
    return;
  }

  const toIso = (unixSeconds: number | null | undefined) => (unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null);

  const payload = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    plan: planForStatus(sub.status),
    trial_start: toIso(sub.trial_start),
    trial_end: toIso(sub.trial_end),
    current_period_start: toIso(sub.current_period_start),
    current_period_end: toIso(sub.current_period_end),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    canceled_at: toIso(sub.canceled_at),
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin.from('subscriptions').upsert(payload, { onConflict: 'user_id' });
  if (error) throw new Error(`Failed to sync subscription: ${error.message}`);
}

async function handleEvent(admin: ReturnType<typeof createAdminClient>, stripe: Stripe, event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === 'subscription' && session.subscription) {
        const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
        const sub = await stripe.subscriptions.retrieve(subId);
        await upsertFromSubscription(admin, sub, session.client_reference_id || (session.metadata?.supabase_user_id as string | undefined));
      }
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await upsertFromSubscription(admin, event.data.object as Stripe.Subscription);
      return;
    }
    case 'invoice.payment_failed':
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id;
        const sub = await stripe.subscriptions.retrieve(subId);
        await upsertFromSubscription(admin, sub);
      }
      return;
    }
    default:
      return; // Not every event type needs a handler here — just acknowledge it.
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secretKey || !webhookSecret) {
    console.error('stripe-webhook: missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return json({ error: 'Webhook not configured' }, 500);
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return json({ error: 'Missing signature' }, 400);
  const rawBody = await req.text();

  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('stripe-webhook: signature verification failed', err);
    return json({ error: 'Invalid signature' }, 400);
  }

  const admin = createAdminClient();

  // Record the event id before processing. A unique-violation here means we've already handled
  // this exact event (Stripe redelivered it) — acknowledge and stop without reprocessing.
  const { error: dedupeError } = await admin.from('stripe_events').insert({ id: event.id, type: event.type });
  if (dedupeError) {
    if (dedupeError.code === '23505') return json({ received: true, deduped: true });
    console.error('stripe-webhook: could not record event', dedupeError);
    return json({ error: 'Could not record event' }, 500);
  }

  try {
    await handleEvent(admin, stripe, event);
    return json({ received: true });
  } catch (err) {
    console.error('stripe-webhook: handler error', err);
    // Let Stripe retry this delivery — remove our dedupe record so the retry isn't swallowed.
    await admin.from('stripe_events').delete().eq('id', event.id);
    return json({ error: 'Webhook handling failed' }, 500);
  }
});
