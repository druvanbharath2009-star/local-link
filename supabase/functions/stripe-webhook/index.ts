// stripe-webhook — called by Stripe (NOT the browser; verify_jwt = false).
// It is the ONLY place that grants a paid benefit, and only after verifying the
// Stripe signature. Idempotent: the payments table's UNIQUE stripe_session_id
// guards against Stripe's at-least-once delivery.
import { adminClient, stripe } from "../_shared/clients.ts";

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  // Signature is computed over the raw body — read it as text, not JSON.
  const raw = await req.text();
  let event: any;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("Signature verification failed:", (err as Error).message);
    return new Response("Bad signature", { status: 400 });
  }

  // We only care about completed, paid checkout sessions.
  if (event.type !== "checkout.session.completed") {
    return new Response("ignored", { status: 200 });
  }

  const session = event.data.object;
  if (session.payment_status !== "paid") {
    return new Response("not paid", { status: 200 });
  }

  const meta = session.metadata ?? {};
  const admin = adminClient();

  // 1) Idempotency guard: claim this session by inserting its payment row.
  //    A duplicate delivery hits the UNIQUE index (code 23505) and we stop.
  const { error: payErr } = await admin.from("payments").insert({
    user_id: meta.user_id,
    amount: (session.amount_total ?? 0) / 100,
    type: meta.grant,
    reference_id: meta.business_id ? Number(meta.business_id) : null,
    stripe_session_id: session.id,
    stripe_payment_id: session.payment_intent ?? null,
    status: "paid",
  });
  if (payErr) {
    if ((payErr as any).code === "23505") {
      return new Response("already processed", { status: 200 });
    }
    console.error("payment insert failed:", payErr);
    return new Response("db error", { status: 500 });
  }

  // 2) Grant the benefit. If anything fails, roll back the guard row so Stripe's
  //    retry can re-attempt the grant cleanly.
  try {
    await grant(admin, meta);
  } catch (err) {
    console.error("grant failed, rolling back payment row:", err);
    await admin.from("payments").delete().eq("stripe_session_id", session.id);
    return new Response("grant error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});

async function grant(admin: any, meta: Record<string, string>) {
  const businessId = Number(meta.business_id);

  if (meta.grant === "lead_bundle") {
    const credits = Number(meta.credits ?? "0");
    const { error } = await admin.rpc("add_lead_credits", {
      p_business_id: businessId,
      p_amount: credits,
    });
    if (error) throw error;
    return;
  }

  if (meta.grant === "topic") {
    const planType = meta.plan_type;
    const topicIds = (meta.topic_ids ?? "").split(",").filter(Boolean).map(Number);
    for (const topicId of topicIds) {
      const { data: existing } = await admin.from("topic_subscriptions")
        .select("id").eq("business_id", businessId).eq("topic_id", topicId)
        .eq("active", 1).maybeSingle();
      if (!existing) {
        const { error } = await admin.from("topic_subscriptions").insert({
          business_id: businessId,
          topic_id: topicId,
          plan_type: planType,
          active: 1,
        });
        if (error) throw error;
      }
    }
    return;
  }

  if (meta.grant === "verification") {
    // Payment happens after admin approval, so paying grants the badge now.
    const { error: vErr } = await admin.from("verification_requests")
      .update({ payment_confirmed: 1 }).eq("business_id", businessId);
    if (vErr) throw vErr;
    const { error: bErr } = await admin.from("businesses")
      .update({ verified: 1, verification_status: "approved" }).eq("id", businessId);
    if (bErr) throw bErr;
    return;
  }

  throw new Error(`Unknown grant type: ${meta.grant}`);
}
