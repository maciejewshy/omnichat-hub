import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { supabaseAdmin } from "./client.server";

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export type ApiUserContext = {
  userId: string;
  tenantId: string;
  roles: string[];
};

export async function requireApiUser(request: Request): Promise<ApiUserContext> {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token || token.split(".").length !== 3) {
    throw new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;

  if (error || !userId) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabaseAdmin.from("profiles").select("tenant_id").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
  ]);

  if (!profile?.tenant_id) {
    throw new Response(JSON.stringify({ error: "Tenant not found" }), { status: 403 });
  }

  return {
    userId,
    tenantId: profile.tenant_id,
    roles: (roles ?? []).map((role) => role.role),
  };
}

export async function requireApiAdmin(request: Request): Promise<ApiUserContext> {
  const context = await requireApiUser(request);
  if (!context.roles.includes("admin") && !context.roles.includes("superadmin")) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }
  return context;
}
