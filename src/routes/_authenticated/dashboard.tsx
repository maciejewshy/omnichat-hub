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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession, isAdmin, highestRoleLabel, hasRole } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardLayout,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">
      Página do painel não encontrada.{" "}
      <Link to="/dashboard" className="ml-1 text-primary hover:underline">
        Voltar
      </Link>
    </div>
  ),
});

function DashboardLayout() {
  const session = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/login", replace: true });
  }

  const canManage = isAdmin(session.roles) || hasRole(session.roles, "gerente");
  const navItems: Array<{ to: string; icon: typeof Inbox; label: string; exact?: boolean }> = [
    { to: "/dashboard", icon: Inbox, label: "Conversas", exact: true },
    { to: "/dashboard/contacts", icon: Users, label: "Contatos" },
  ];
  if (canManage) {
    navItems.push({ to: "/dashboard/reports", icon: BarChart3, label: "Relatórios" });
    navItems.push({ to: "/dashboard/campaigns", icon: Megaphone, label: "Campanhas" });
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
    <SidebarProvider defaultOpen={false}>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <DashboardSidebar
          navItems={navItems}
          initials={initials}
          name={session.profile?.full_name ?? session.user?.email ?? ""}
          isSuperadmin={hasRole(session.roles, "superadmin")}
          onSignOut={handleSignOut}
        />

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
    </SidebarProvider>
  );
}

function DashboardSidebar({
  navItems,
  initials,
  name,
  isSuperadmin,
  onSignOut,
}: {
  navItems: Array<{ to: string; icon: typeof Inbox; label: string; exact?: boolean }>;
  initials: string;
  name: string;
  isSuperadmin: boolean;
  onSignOut: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const ExpandedIcon = collapsed ? ChevronRight : ChevronLeft;

  return (
    <Sidebar collapsible="icon" className="border-r bg-sidebar text-sidebar-foreground">
      <SidebarHeader className="p-2">
        <div className="flex items-center justify-between">
          <Link
            to="/dashboard"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          >
            <MessageSquare className="h-5 w-5" />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-7 w-7 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            <ExpandedIcon className="h-4 w-4" />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className={cn(
                        "h-11",
                        active
                          ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      )}
                    >
                      <Link to={item.to} className="flex items-center gap-3">
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          {isSuperadmin && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="Superadmin"
                className="h-11 text-warning hover:bg-sidebar-accent"
              >
                <Link to="/dashboard/superadmin" className="flex items-center gap-3">
                  <Shield className="h-5 w-5 shrink-0" />
                  <span className="truncate">Superadmin</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onSignOut}
              tooltip="Sair"
              className="h-11 cursor-pointer text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              <span className="truncate">Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <div
              title={name}
              className="flex h-11 items-center gap-3 rounded-md px-2.5 text-sidebar-foreground/70"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {initials}
              </div>
              <span className="truncate text-sm">{name}</span>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
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
        <SidebarTrigger
          className="mr-1 h-7 w-7"
          aria-label="Alternar menu"
        />
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
