// admin-delete-user — called by an admin's browser from the user management page.
// Deleting only the `profiles` row from the client leaves the auth.users row
// behind, and the login self-heal would recreate the profile on the user's next
// sign-in. Removing an auth user needs the service role, so it happens here.
// The caller's admin status is checked against `profiles`, never against the
// JWT's user_metadata (which users can write themselves).
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

    const admin = adminClient();

    const { data: me } = await admin.from("profiles")
      .select("role").eq("id", user.id).maybeSingle();
    if (!me || me.role !== "admin") return json({ error: "Admins only" }, 403);

    const { userId } = (await req.json()) ?? {};
    if (!userId) return json({ error: "userId is required" }, 400);
    if (userId === user.id) return json({ error: "You cannot delete yourself" }, 400);

    const { data: target } = await admin.from("profiles")
      .select("role").eq("id", userId).maybeSingle();
    if (!target) return json({ error: "User not found" }, 404);
    if (target.role === "admin") return json({ error: "Cannot delete an admin" }, 400);

    // profiles.id references auth.users ON DELETE CASCADE, and businesses
    // references profiles the same way, so this removes the whole account.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;

    return json({ message: "User deleted" });
  } catch (err) {
    console.error("admin-delete-user error:", err);
    return json({ error: (err as Error).message ?? "Server error" }, 500);
  }
});
