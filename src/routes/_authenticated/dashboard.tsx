import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  MessageSquare,
  Users,
  BarChart3,
  Megaphone,
  Bot,
  Settings,
  LogOut,
  Inbox,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession, isAdmin, highestRoleLabel, hasRole } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const session = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/login", replace: true });
  }

  const navItems = [
    { to: "/dashboard", icon: Inbox, label: "Conversas", exact: true },
    { to: "/dashboard/contacts", icon: Users, label: "Contatos" },
    { to: "/dashboard/reports", icon: BarChart3, label: "Relatórios" },
    { to: "/dashboard/campaigns", icon: Megaphone, label: "Campanhas" },
  ];
  if (isAdmin(session.roles) || hasRole(session.roles, "gerente")) {
    navItems.push({ to: "/dashboard/bot-builder", icon: Bot, label: "Bot" });
  }
  navItems.push({ to: "/dashboard/settings", icon: Settings, label: "Configurações" });

  const initials = (session.profile?.full_name || session.user?.email || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Primary icon sidebar */}
      <aside className="flex w-16 shrink-0 flex-col items-center gap-1 border-r bg-nav py-3 text-nav-foreground">
        <Link to="/dashboard" className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <MessageSquare className="h-5 w-5" />
        </Link>
        <div className="my-1 h-px w-8 bg-nav-foreground/10" />
        {navItems.map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              title={item.label}
              className={`flex h-11 w-11 items-center justify-center rounded-lg transition ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-nav-foreground/70 hover:bg-nav-foreground/10 hover:text-nav-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" />
            </Link>
          );
        })}
        {hasRole(session.roles, "superadmin") && (
          <Link
            to="/superadmin"
            title="Superadmin"
            className="mt-auto flex h-11 w-11 items-center justify-center rounded-lg text-warning hover:bg-nav-foreground/10"
          >
            <Shield className="h-5 w-5" />
          </Link>
        )}
        <div className={hasRole(session.roles, "superadmin") ? "" : "mt-auto"}>
          <button
            onClick={handleSignOut}
            title="Sair"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-nav-foreground/70 hover:bg-nav-foreground/10 hover:text-nav-foreground"
          >
            <LogOut className="h-5 w-5" />
          </button>
          <div
            title={session.profile?.full_name ?? session.user?.email ?? ""}
            className="mt-1 flex h-9 w-9 mx-auto items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          >
            {initials}
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopBar
          userName={session.profile?.full_name ?? "—"}
          tenantName={session.tenant?.name ?? "Carregando…"}
          roleLabel={highestRoleLabel(session.roles)}
        />
        <div className="flex min-h-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function DashboardTopBar({
  userName,
  tenantName,
  roleLabel,
}: {
  userName: string;
  tenantName: string;
  roleLabel: string;
}) {
  return (
    <header className="flex h-12 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold">{tenantName}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{userName}</span>
      </div>
      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
        {roleLabel}
      </span>
    </header>
  );
}
