# Stripe setup — step by step (Local Link)

A click-by-click walkthrough of the Stripe side only. When you finish, you'll
have: an account, 4 prices, a secret key, and a webhook signing secret — the
exact values the Edge Functions read. Deployment of the functions themselves is
in `PAYMENTS_SETUP.md`.

Everything below is done in **Test mode** first. Going live is a 5-minute repeat
at the end.

---

## 0. The mental model (read once)

You never write Stripe API calls by hand. Our `create-checkout` function builds
a **Checkout Session** from a **Price** you create in the dashboard, and Stripe
hosts the card page. When payment succeeds Stripe POSTs an event to our
`stripe-webhook` function. So from Stripe you only need to produce **five
strings**:

| Stripe thing | Env var the code reads |
|---|---|
| Secret key | `STRIPE_SECRET_KEY` |
| Lead bundle price | `PRICE_LEAD_BUNDLE` |
| Topic single price | `PRICE_TOPIC_SINGLE` |
| Topic bundle price | `PRICE_TOPIC_BUNDLE` |
| Verification price | `PRICE_VERIFICATION` |
| Webhook signing secret | `STRIPE_WEBHOOK_SECRET` |

Keep a scratch note open; you'll paste these into one `supabase secrets set`
command at the end.

---

## 1. Create the account

1. Go to <https://dashboard.stripe.com/register>.
2. Enter email, full name, password → verify your email.
3. You'll land in the Dashboard. **You do NOT need to "activate" the account
   (business details, bank account) to test** — activation is only required to
   move real money (live mode). Skip any "complete your profile" prompts for now.

## 2. Confirm you're in Test mode

- Top-right of the dashboard there's a **Test mode** toggle. It should be **ON**
  (the header area shows an orange "Test mode" indicator).
- Everything you create in test mode is sandboxed and invisible to live mode —
  test keys, test prices, and test webhooks are all separate from live ones.

## 3. Get your Secret key  → `STRIPE_SECRET_KEY`

1. Left sidebar → **Developers** → **API keys**
   (direct link: <https://dashboard.stripe.com/test/apikeys>).
2. You'll see two keys:
   - **Publishable key** `pk_test_…` — *not needed* (Checkout is hosted; we never
     mount Stripe.js in the browser).
   - **Secret key** `sk_test_…` — click **Reveal**, copy it.
3. Paste into your scratch note as `STRIPE_SECRET_KEY`.

> Treat `sk_test_…` like a password, but it's test-only so a leak just lets
> someone create fake test charges. The **live** secret key later is genuinely
> sensitive.

## 4. Create the 4 Products + Prices

We need four **one-time** prices. Do this four times:

1. Left sidebar → **Product catalog** (a.k.a. Products) → **+ Add product**
   (<https://dashboard.stripe.com/test/products/create>).
2. Fill in:
   - **Name** (see table below)
   - **Pricing model**: leave **Standard pricing**
   - **Price**: the amount below, currency **USD**
   - **Billing period**: choose **One time** (NOT "Recurring" — these are
     single charges, not subscriptions)
3. Click **Add product** (or **Save product**).
4. On the saved product page, find the **Pricing** section → click the price →
   copy its **API ID**, which looks like `price_1Q9abc...`. (You can also copy it
   from the "..." menu next to the price → **Copy price ID**.)
5. Paste into your scratch note against the right env var.

| # | Product name | Price | Billing | Env var |
|---|---|---|---|---|
| 1 | `Local Link — Lead Credit Bundle (10)` | **$19.90** | One time | `PRICE_LEAD_BUNDLE` |
| 2 | `Local Link — Topic Subscription (Single)` | **$14.99** | One time | `PRICE_TOPIC_SINGLE` |
| 3 | `Local Link — Topic Subscription (Bundle)` | **$39.99** | One time | `PRICE_TOPIC_BUNDLE` |
| 4 | `Local Link — Business Verification` | **$10.00** | One time | `PRICE_VERIFICATION` |

> ⚠️ Copy the **Price ID** (`price_…`), not the Product ID (`prod_…`). The code
> needs `price_…`. A product can hold several prices; we use one each.

At this point you have 5 of the 6 strings. The webhook secret (step 6) needs the
function deployed first.

## 5. (Do the Supabase deploy now)

Switch to `PAYMENTS_SETUP.md` steps 3–6: run the SQL, `supabase link`,
`supabase secrets set` the 5 strings you have so far, and
`supabase functions deploy` all three functions. Then come back here for the
webhook.

You can set the 5 known secrets now and add the 6th after step 6:

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_xxx \
  PRICE_LEAD_BUNDLE=price_xxx \
  PRICE_TOPIC_SINGLE=price_xxx \
  PRICE_TOPIC_BUNDLE=price_xxx \
  PRICE_VERIFICATION=price_xxx \
  LEAD_BUNDLE_CREDITS=10
```

## 6. Create the Webhook  → `STRIPE_WEBHOOK_SECRET`

1. Left sidebar → **Developers** → **Webhooks**
   (<https://dashboard.stripe.com/test/webhooks>) → **+ Add endpoint**.
2. **Endpoint URL** — your deployed function:
   ```
   https://evksghzxchkkoxwvzmiv.functions.supabase.co/stripe-webhook
   ```
3. **Listen to events** → click **+ Select events** → search and check exactly:
   - ✅ `checkout.session.completed`
   (Leave everything else unchecked — that's the only event our code handles.)
4. Click **Add endpoint**.
5. On the endpoint's page, find **Signing secret** → click **Reveal** → copy the
   `whsec_…` value. That's `STRIPE_WEBHOOK_SECRET`.
6. Set it and redeploy so the function picks it up:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
   supabase functions deploy stripe-webhook
   ```

> The signing secret is how the function proves the request really came from
> Stripe (`stripe.webhooks.constructEventAsync`). Without it, the function
> rejects everything with a 400 — so this step is mandatory, not optional.

## 7. Test a real (test) payment

Use Stripe's test card on the hosted Checkout page:

| Field | Value |
|---|---|
| Card number | `4242 4242 4242 4242` |
| Expiry | any future date, e.g. `12 / 34` |
| CVC | any 3 digits, e.g. `123` |
| Name / ZIP | anything |

Flow: log in as a **business** → trigger any paid action → you're sent to
`checkout.stripe.com` → pay with the test card → you're redirected back to Local
Link with a green success banner.

**Verify it worked end-to-end:**
- Stripe Dashboard → **Developers → Webhooks → your endpoint → Recent
  deliveries**: the `checkout.session.completed` event should show **200**.
- Stripe → **Payments**: you'll see a successful test payment.
- In the app: credits appear / subscription is active / verification is pending.
- Function logs if something's off: `supabase functions logs stripe-webhook`.

### Other useful test cards
| Scenario | Card |
|---|---|
| Success | `4242 4242 4242 4242` |
| Requires authentication (3DS) | `4000 0025 0000 3155` |
| Declined (generic) | `4000 0000 0000 0002` |
| Declined (insufficient funds) | `4000 0000 0000 9995` |

Full list: <https://docs.stripe.com/testing>.

---

## 8. (Optional) Test locally before deploying

If you want to exercise the webhook against a locally-served function instead of
the deployed one:

```bash
# Terminal 1 — serve functions locally with your secrets
supabase functions serve --env-file ./supabase/.env.local

# Terminal 2 — forward Stripe test events to the local function
brew install stripe/stripe-cli/stripe
stripe login
stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook
```

`stripe listen` prints its **own** `whsec_…` — put that in `.env.local` as
`STRIPE_WEBHOOK_SECRET` for local runs (it differs from the dashboard one).
Trigger a test event with `stripe trigger checkout.session.completed` or by doing
a real test checkout.

> Create `supabase/.env.local` with the same keys as step 5 + the local
> `STRIPE_WEBHOOK_SECRET`. Don't commit it — add `supabase/.env.local` to
> `.gitignore`.

---

## 9. Going live (when you're ready for real money)

1. **Activate the account**: Dashboard → **Activate** / complete business +
   bank details. Stripe won't release live keys until this is done.
2. Flip the dashboard to **Live mode** (toggle off Test mode).
3. Repeat **step 4** in live mode — recreate the 4 products/prices (test prices
   don't carry over). Copy the new live `price_…` IDs.
4. **Developers → API keys** in live mode → copy the live **`sk_live_…`**.
5. Repeat **step 6** in live mode — add the webhook at the same URL, copy its
   live `whsec_…`.
6. Push the live values and redeploy:
   ```bash
   supabase secrets set \
     STRIPE_SECRET_KEY=sk_live_xxx \
     STRIPE_WEBHOOK_SECRET=whsec_live_xxx \
     PRICE_LEAD_BUNDLE=price_live_xxx \
     PRICE_TOPIC_SINGLE=price_live_xxx \
     PRICE_TOPIC_BUNDLE=price_live_xxx \
     PRICE_VERIFICATION=price_live_xxx
   supabase functions deploy create-checkout
   supabase functions deploy unlock-lead
   supabase functions deploy stripe-webhook
   ```
7. Do one real low-stakes purchase with a real card to confirm, then refund it
   from the dashboard if you like.

---

## Quick reference — the 6 strings

```
STRIPE_SECRET_KEY      = sk_test_...   (Developers → API keys)
PRICE_LEAD_BUNDLE      = price_...      ($19.90 product)
PRICE_TOPIC_SINGLE     = price_...      ($14.99 product)
PRICE_TOPIC_BUNDLE     = price_...      ($39.99 product)
PRICE_VERIFICATION     = price_...      ($10.00 product)
STRIPE_WEBHOOK_SECRET  = whsec_...      (Developers → Webhooks → endpoint)
```

Webhook URL: `https://evksghzxchkkoxwvzmiv.functions.supabase.co/stripe-webhook`
Webhook event: `checkout.session.completed`
