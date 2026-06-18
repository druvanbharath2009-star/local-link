// unlock-lead — called by the logged-in business owner's browser.
// Replaces the old client-side unlock (which RLS now forbids). Server-side it
// decides: free (within the 5-lead quota) or spend one prepaid credit. Only
// then does it reveal the contact details by setting `unlocked = 1`.
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, userClient } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);
    const { data: { user }, error: authErr } = await userClient(authHeader)
      .auth.getUser();
    if (authErr || !user) return json({ error: "Not authenticated" }, 401);

    const { leadId } = (await req.json()) ?? {};
    if (!leadId) return json({ error: "leadId is required" }, 400);

    const admin = adminClient();

    const { data: biz } = await admin.from("businesses")
      .select("id, free_leads_used, lead_credits")
      .eq("user_id", user.id).single();
    if (!biz) return json({ error: "Business not found" }, 400);

    // Lead must belong to THIS business (ownership check) and be still locked.
    const { data: lead } = await admin.from("interest_forms")
      .select("*").eq("id", leadId).eq("business_id", biz.id).single();
    if (!lead) return json({ error: "Lead not found" }, 404);
    if (lead.unlocked) return json({ error: "Lead already unlocked" }, 400);

    const isFree = biz.free_leads_used < 5;

    if (isFree) {
      const { error } = await admin.from("businesses")
        .update({ free_leads_used: biz.free_leads_used + 1 }).eq("id", biz.id);
      if (error) throw error;
    } else {
      // Atomically spend a credit; -1 means the balance was empty.
      const { data: newBalance, error } = await admin.rpc("spend_lead_credit", {
        p_business_id: biz.id,
      });
      if (error) throw error;
      if (newBalance === -1) {
        return json({
          error: "No lead credits left",
          needsCredits: true,
          lead_credits: 0,
        }, 402);
      }
      // Audit row at amount 0 — revenue was already booked at bundle purchase,
      // so we don't double-count it here.
      await admin.from("payments").insert({
        user_id: user.id,
        amount: 0,
        type: "lead_unlock",
        reference_id: Number(lead.id),
        status: "credit",
      });
    }

    const { data: unlocked } = await admin.from("interest_forms")
      .update({ unlocked: 1 }).eq("id", leadId).select().single();

    const { data: after } = await admin.from("businesses")
      .select("free_leads_used, lead_credits").eq("id", biz.id).single();

    return json({
      message: isFree ? "Lead unlocked (free)" : "Lead unlocked (1 credit spent)",
      lead: unlocked,
      free_leads_used: after?.free_leads_used,
      lead_credits: after?.lead_credits,
    });
  } catch (err) {
    console.error("unlock-lead error:", err);
    return json({ error: (err as Error).message ?? "Server error" }, 500);
  }
});
