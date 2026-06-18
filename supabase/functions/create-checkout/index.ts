// create-checkout — called by the logged-in business owner's browser.
// Validates the request, creates a Stripe Checkout Session, and returns its URL.
// It grants NOTHING; the actual benefit is granted by stripe-webhook only after
// the session is paid. All the data the webhook needs is stashed in metadata.
import { corsHeaders, json } from "../_shared/cors.ts";
import {
  adminClient,
  LEAD_BUNDLE_CREDITS,
  PRICE_IDS,
  stripe,
  userClient,
} from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    // Who is calling? (RLS-respecting client — just resolves identity.)
    const { data: { user }, error: authErr } = await userClient(authHeader)
      .auth.getUser();
    if (authErr || !user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json();
    const { type, plan_type, topic_ids, success_url, cancel_url } = body ?? {};
    if (!success_url || !cancel_url) {
      return json({ error: "success_url and cancel_url are required" }, 400);
    }

    // Every paid action here belongs to a business. Resolve it once.
    const admin = adminClient();
    const { data: biz } = await admin.from("businesses")
      .select("id, verified, verification_status")
      .eq("user_id", user.id).single();
    if (!biz) return json({ error: "Business not found" }, 400);

    // Build the line item + the metadata the webhook will act on.
    let priceKey: string;
    const metadata: Record<string, string> = {
      user_id: user.id,
      business_id: String(biz.id),
    };

    if (type === "lead_bundle") {
      priceKey = "lead_bundle";
      metadata.grant = "lead_bundle";
      metadata.credits = String(LEAD_BUNDLE_CREDITS);
    } else if (type === "topic") {
      if (!["single", "bundle"].includes(plan_type)) {
        return json({ error: "Invalid plan_type" }, 400);
      }
      const ids = Array.isArray(topic_ids) ? topic_ids.map(String) : [];
      if (plan_type === "single" && ids.length !== 1) {
        return json({ error: "Single plan requires exactly 1 topic" }, 400);
      }
      if (plan_type === "bundle" && ids.length !== 3) {
        return json({ error: "Bundle plan requires exactly 3 topics" }, 400);
      }
      priceKey = plan_type === "single" ? "topic_single" : "topic_bundle";
      metadata.grant = "topic";
      metadata.plan_type = plan_type;
      metadata.topic_ids = ids.join(",");
    } else if (type === "verification") {
      if (biz.verified) return json({ error: "Already verified" }, 400);
      if (biz.verification_status === "pending") {
        return json({ error: "Verification already pending" }, 400);
      }
      priceKey = "verification";
      metadata.grant = "verification";
    } else {
      return json({ error: "Unknown checkout type" }, 400);
    }

    const price = PRICE_IDS[priceKey];
    if (!price) return json({ error: `Missing price config for ${priceKey}` }, 500);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price, quantity: 1 }],
      success_url,
      cancel_url,
      client_reference_id: user.id,
      metadata,
      // Surface metadata on the PaymentIntent too, for dashboard auditing.
      payment_intent_data: { metadata },
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("create-checkout error:", err);
    return json({ error: (err as Error).message ?? "Server error" }, 500);
  }
});
