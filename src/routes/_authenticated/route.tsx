import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
    return { user: data.user };
  },
  pendingComponent: () => (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Carregando…
    </div>
  ),
  component: () => <Outlet />,
});
