import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "superadmin" | "admin" | "gerente" | "agente";

export interface SessionState {
  user: User | null;
  loading: boolean;
  profile: {
    id: string;
    tenant_id: string;
    full_name: string;
    email: string;
    availability: string;
  } | null;
  tenant: {
    id: string;
    name: string;
    plan: string;
    status: string;
  } | null;
  roles: AppRole[];
}

export function useSession(): SessionState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<SessionState>({
    user: null,
    loading: true,
    profile: null,
    tenant: null,
    roles: [],
  });

  async function load(user: User | null) {
    if (!user) {
      setState({ user: null, loading: false, profile: null, tenant: null, roles: [] });
      return;
    }
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    let tenant = null;
    if (profile?.tenant_id) {
      const { data } = await supabase
        .from("tenants")
        .select("id,name,plan,status")
        .eq("id", profile.tenant_id)
        .maybeSingle();
      tenant = data ?? null;
    }
    setState({
      user,
      loading: false,
      profile: (profile as SessionState["profile"]) ?? null,
      tenant,
      roles: ((roles ?? []).map((r) => r.role) as AppRole[]) ?? [],
    });
  }

  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      load(session?.user ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      load(data.session?.user ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function refresh() {
    const { data } = await supabase.auth.getSession();
    await load(data.session?.user ?? null);
  }

  return { ...state, refresh };
}

export function hasRole(roles: AppRole[], role: AppRole): boolean {
  return roles.includes(role);
}
export function isAdmin(roles: AppRole[]): boolean {
  return roles.includes("admin") || roles.includes("superadmin");
}
export function isAdminOrManager(roles: AppRole[]): boolean {
  return isAdmin(roles) || roles.includes("gerente");
}
export function highestRoleLabel(roles: AppRole[]): string {
  if (roles.includes("superadmin")) return "Superadmin";
  if (roles.includes("admin")) return "Admin";
  if (roles.includes("gerente")) return "Gerente";
  if (roles.includes("agente")) return "Agente";
  return "Membro";
}
