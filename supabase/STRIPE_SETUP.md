# StudySprint Pro — Stripe setup & testing guide

StudySprint's Pro subscription is powered entirely by Stripe Checkout + Stripe webhooks, running
inside Supabase Edge Functions. No Stripe secret ever touches the frontend — the browser only ever
gets redirected to a URL Stripe hands back. This guide covers everything needed to get it running
in **test mode** locally, and how to flip it to **live mode** later.

## 1. Create the Stripe product & price (test mode)

1. In the [Stripe Dashboard](https://dashboard.stripe.com), make sure the **Test mode** toggle
   (top right) is on.
2. Go to **Product catalog → Add product**.
   - Name: `StudySprint Pro`
   - Pricing: **Recurring**, `$5.99`, billing period **Monthly**
3. Save the product, then open it and copy the **Price ID** (starts with `price_...`) — this is
   `STRIPE_PRICE_ID_PRO`.
4. Go to **Developers → API keys** and copy the **Secret key** (starts with `sk_test_...`) — this
   is `STRIPE_SECRET_KEY`. Never put this in frontend code or a `VITE_*` variable.

The 7-day free trial is not configured on the price itself — it's applied per-Checkout-Session by
the `stripe-checkout` Edge Function (`subscription_data.trial_period_days: 7`), and only the first
time a given StudySprint account checks out (tracked in `public.subscriptions.trial_start`).

## 2. Environment variables

Edge Function secrets (never in the frontend `.env`) — see `supabase/functions/.env.example`:

| Variable | Where it comes from |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Created in step 3 below |
| `STRIPE_PRICE_ID_PRO` | The price id from step 1 |
| `APP_URL` | Your deployed app URL (e.g. `https://studysprint.example.com`), no trailing slash. For local dev this can be omitted — the functions fall back to the request's `Origin` header. |
| `ANTHROPIC_API_KEY` | Already required by the existing AI features |

For a deployed Supabase project:
```
supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... STRIPE_PRICE_ID_PRO=price_... APP_URL=https://your-app-url
```

For local `supabase functions serve`, copy `supabase/functions/.env.example` to
`supabase/functions/.env` (gitignored), fill in real test values, and run:
```
supabase functions serve --env-file supabase/functions/.env
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do not set them.

The frontend needs no Stripe environment variables at all.

## 3. Configure the webhook

The webhook is what actually keeps StudySprint's database in sync — Stripe calls it directly, so
it's exempted from Supabase's JWT check via `supabase/config.toml` (`[functions.stripe-webhook]
verify_jwt = false`).

**Local testing** — use the Stripe CLI, which forwards real test-mode events to your machine and
prints a webhook signing secret to use as `STRIPE_WEBHOOK_SECRET`:
```
stripe login
stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook
# copy the "whsec_..." it prints into supabase/functions/.env
```

**Deployed project** — after deploying the function:
```
supabase functions deploy stripe-webhook
```
Then in the Stripe Dashboard: **Developers → Webhooks → Add endpoint**
- Endpoint URL: `https://<project-ref>.functions.supabase.co/stripe-webhook`
- Events to send: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`,
  `invoice.paid`
- Copy the endpoint's **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.

## 4. Deploy

```
supabase db push                                        # creates subscriptions/ai_usage/stripe_events + increment_ai_usage()
supabase functions deploy stripe-checkout
supabase functions deploy stripe-portal
supabase functions deploy stripe-webhook
supabase functions deploy ai-assistant
supabase functions deploy parse-syllabus
supabase functions deploy analyze-work
supabase functions deploy generate-quiz
```
(The last four are redeployed because they now check auth + usage limits before calling
Anthropic.)

## 5. Testing checklist (test mode)

Use Stripe's [test cards](https://stripe.com/docs/testing) throughout — never real card numbers.

- **Start a subscription / trial**: In StudySprint, go to Settings → Subscription → "Start 7-Day
  Free Trial" (or trigger it from a usage-limit paywall). On the Stripe Checkout page, use card
  `4242 4242 4242 4242`, any future expiry, any CVC. You'll land back on `?checkout=success`;
  within a few seconds the Settings panel should show "PRO — Free trial — 7 days left."
- **Trial → paid conversion**: In the Stripe Dashboard, open the test customer's subscription and
  use **"Advance test clock"** (or just wait — Stripe test mode trials still run in real time
  unless you use a [Test Clock](https://stripe.com/docs/billing/testing/test-clocks)) to jump past
  `trial_end`. Confirm `customer.subscription.updated` fires and `subscriptions.status` in your
  database flips to `active`.
- **Canceled checkout**: Start checkout, then click Stripe's back arrow instead of paying. You
  should land on `?checkout=cancel` with a "Checkout canceled" toast and no database changes.
- **Failed payment**: Use card `4000 0000 0000 0341` (attaches but fails on charge) or
  `4000 0000 0000 9995` (insufficient funds) to trigger `invoice.payment_failed`; confirm the
  subscription's status updates accordingly (e.g. `past_due`) and StudySprint's usage limits fall
  back to the free tier.
- **Cancellation**: From Settings → "Manage subscription", cancel in the Billing Portal. Confirm
  `cancel_at_period_end` becomes `true` immediately (Pro access continues until the period ends)
  and `customer.subscription.deleted` at period end flips `status`/`plan` back to free.
- **Expired subscription / trial**: Either scenario ends the same way — a
  `customer.subscription.updated` or `.deleted` event with a non-pro status, which
  `getUserSubscriptionStatus` reads as `plan: 'free'`, so AI Edge Functions immediately start
  enforcing free-tier limits again.
- **AI usage limits**: As a free-plan test user, call an AI feature (e.g. the AI Organizer) more
  than its configured limit (default 8/month) — you should get the "You've reached your free AI
  Organizer limit…" paywall, not a generic error.
- **Missing Stripe config**: Temporarily unset `STRIPE_SECRET_KEY` and hit "Start 7-Day Free
  Trial" — you should get a clear "Subscriptions aren't configured yet" message, never a silent
  bypass into Pro access.

## 6. Going live

1. Repeat step 1 in **live mode** to get a live product/price (`price_...` will differ from test).
2. Create a **live** webhook endpoint pointing at the same `/stripe-webhook` URL and grab its live
   signing secret.
3. Update the deployed secrets with live values:
   ```
   supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_live_... STRIPE_PRICE_ID_PRO=price_live_... APP_URL=https://your-production-domain
   ```
4. Nothing else changes — the same code, database schema, and UI serve both modes; only the
   secrets differ.
