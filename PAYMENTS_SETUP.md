# Local Link — Payments setup (Stripe + Supabase Edge Functions)

This wires real payments into the three paid moments in the app:

| Flow | What the user pays | How the benefit is granted |
|------|--------------------|----------------------------|
| **Lead credit bundle** | $19.90 → 10 unlock credits | `stripe-webhook` adds credits to `businesses.lead_credits` |
| **Unlock a lead** | first 5 free, then **1 credit** | `unlock-lead` function spends a credit, reveals contact |
| **Topic subscription** | $14.99 single / $39.99 bundle | `stripe-webhook` inserts `topic_subscriptions` |
| **Business verification** | $10 one-time | `stripe-webhook` sets verification `pending` |

**Architecture:** the browser can no longer grant itself any of these (RLS forbids it). It asks an Edge Function for a Stripe Checkout URL and redirects. Stripe collects the card on its own hosted page (we store no card data). When the charge clears, Stripe calls `stripe-webhook`, which is the **only** place a benefit is granted.

Total fixed cost: **$0**. You pay only Stripe's 2.9% + $0.30 per purchase.

---

## One-time setup

### 1. Stripe account + test keys
1. Create an account at <https://stripe.com>, stay in **Test mode** (toggle, top-right).
2. Developers → API keys → copy the **Secret key** (`sk_test_…`). (The publishable key isn't needed — Checkout is hosted.)

### 2. Create the 4 Products/Prices (Test mode)
Stripe Dashboard → Product catalog → **+ Add product**. Create one-time prices:

| Product | Price | After saving, copy the Price ID |
|---------|-------|----------------------------------|
| Lead Credit Bundle (10) | $19.90 | `price_…` → `PRICE_LEAD_BUNDLE` |
| Topic Subscription — Single | $14.99 | `price_…` → `PRICE_TOPIC_SINGLE` |
| Topic Subscription — Bundle | $39.99 | `price_…` → `PRICE_TOPIC_BUNDLE` |
| Business Verification | $10.00 | `price_…` → `PRICE_VERIFICATION` |

> A Price ID looks like `price_1Q...`. It's on the product page under the price.

### 3. Run the SQL (Supabase → SQL Editor → New query)
Run each file's contents once:
1. `backend/payments_migration.sql` — adds `lead_credits`, webhook idempotency, and the `add_lead_credits` / `spend_lead_credit` functions.
2. `backend/rls_policies.sql` — **re-run it** to apply the lockdown (drops the client's ability to unlock/subscribe/verify/log-payments and revokes the money columns).

### 4. Install + link the Supabase CLI
```bash
brew install supabase/tap/supabase        # or see supabase.com/docs/guides/cli
supabase login                            # opens browser
cd "/Users/druvanbharath/Desktop/Local Link"
supabase link --project-ref evksghzxchkkoxwvzmiv
```

### 5. Set the Edge Function secrets
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the platform — **do not set them.** You only set:

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_xxx \
  PRICE_LEAD_BUNDLE=price_xxx \
  PRICE_TOPIC_SINGLE=price_xxx \
  PRICE_TOPIC_BUNDLE=price_xxx \
  PRICE_VERIFICATION=price_xxx \
  LEAD_BUNDLE_CREDITS=10
```
(`STRIPE_WEBHOOK_SECRET` is added in step 7, after the webhook exists.)

### 6. Deploy the functions
```bash
supabase functions deploy create-checkout
supabase functions deploy unlock-lead
supabase functions deploy stripe-webhook   # config.toml sets verify_jwt=false for this one
```

### 7. Create the Stripe webhook → get the signing secret
1. Stripe Dashboard → Developers → **Webhooks** → **Add endpoint**.
2. Endpoint URL:
   `https://evksghzxchkkoxwvzmiv.functions.supabase.co/stripe-webhook`
3. Events to send: **`checkout.session.completed`**.
4. After creating it, copy the **Signing secret** (`whsec_…`), then:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
   supabase functions deploy stripe-webhook   # redeploy to pick up the secret
   ```

---

## Testing (Test mode)

Use Stripe's test card: **`4242 4242 4242 4242`**, any future expiry, any CVC, any ZIP.

1. **Verification** — log in as a business → Verification flow → *Submit & Pay $10* → pay on Stripe → you return with a success banner → admin sees a pending request.
2. **Topic subscription** — pick topics → checkout → *Continue to secure payment* → pay → subscription appears.
3. **Lead credits** — Lead Manager → use up the 5 free unlocks → *Buy 10 for $19.90* → pay → balance shows 10 → unlock spends 1.

Watch deliveries in Stripe → Webhooks → your endpoint (should show `200`). Function logs: `supabase functions logs stripe-webhook`.

### Confirm the security actually holds
While logged in as a business, open the browser console and try to cheat:
```js
await _sb.from('interest_forms').update({ unlocked: 1 }).eq('id', SOME_LEAD_ID);
await _sb.from('topic_subscriptions').insert({ business_id: 1, topic_id: 1, plan_type: 'single' });
await _sb.from('businesses').update({ lead_credits: 999 }).eq('id', 1);
```
All three must fail or affect 0 rows. If any succeeds, the RLS lockdown (step 3) didn't apply — re-run `backend/rls_policies.sql`.

---

## Going live
1. Flip Stripe to **Live mode**, recreate the 4 products, grab live `price_…` IDs and the live `sk_live_…`.
2. Create a **live** webhook at the same URL, grab its live `whsec_…`.
3. `supabase secrets set` the live values, then redeploy all three functions.

---

## Cost reference
| Item | Cost |
|------|------|
| Supabase Edge Functions | $0 (free tier, 500K calls/mo) |
| Netlify hosting | unchanged |
| Stripe monthly | $0 |
| Per purchase | 2.9% + $0.30 |
| $19.90 bundle nets | ~$19.02 (≈4.4% fee vs ~17% if charging $1.99/lead) |

This is why leads are sold as credit bundles: one flat $0.30 fee covers 10 unlocks instead of 10 fees.
