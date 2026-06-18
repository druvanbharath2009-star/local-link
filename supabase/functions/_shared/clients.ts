// Shared Stripe + Supabase client builders and price/credit config.
// All secrets come from Edge Function env (`supabase secrets set ...`).
import Stripe from "npm:stripe@^14";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  // Stripe's Node SDK defaults to a Node http client; on Deno we hand it fetch.
  httpClient: Stripe.createFetchHttpClient(),
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

// Service-role client: bypasses RLS. ONLY used to grant benefits after payment
// is verified. Never expose this key to the browser.
export function adminClient(): SupabaseClient {
  return createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// Per-request client that runs AS THE CALLER, using the JWT they sent. We use
// it only to resolve "who is calling" (auth.getUser); it respects RLS.
export function userClient(authHeader: string): SupabaseClient {
  return createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

// Maps a checkout `type` to its Stripe Price id (set these in env after you
// create the Products in the Stripe dashboard).
export const PRICE_IDS: Record<string, string> = {
  lead_bundle: Deno.env.get("PRICE_LEAD_BUNDLE")!,
  topic_single: Deno.env.get("PRICE_TOPIC_SINGLE")!,
  topic_bundle: Deno.env.get("PRICE_TOPIC_BUNDLE")!,
  verification: Deno.env.get("PRICE_VERIFICATION")!,
};

// How many lead-unlock credits one bundle purchase grants.
export const LEAD_BUNDLE_CREDITS = Number(
  Deno.env.get("LEAD_BUNDLE_CREDITS") ?? "10",
);
