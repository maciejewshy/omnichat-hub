import { useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

type AvailabilityStatus = "online" | "busy" | "offline";

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
  const [updatingAvailability, setUpdatingAvailability] = useState(false);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/login", replace: true });
  }

  async function handleAvailabilityChange(nextAvailability: AvailabilityStatus) {
    const currentAvailability = session.profile?.availability as AvailabilityStatus | undefined;
    if (!currentAvailability || nextAvailability === currentAvailability) {
      return;
    }

    setUpdatingAvailability(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/profile/availability", {
        method: "POST",
        headers,
        body: JSON.stringify({ availability: nextAvailability }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Erro ao atualizar disponibilidade",
        );
      }

      await session.refresh();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["tenant-members"] }),
        queryClient.invalidateQueries({ queryKey: ["routing-profiles"] }),
      ]);

      const reassignedCount =
        payload &&
        typeof payload === "object" &&
        "reassignedCount" in payload &&
        typeof payload.reassignedCount === "number"
          ? payload.reassignedCount
          : 0;

      if (reassignedCount > 0) {
        toast.success(
          `Disponibilidade atualizada. ${reassignedCount} conversa${reassignedCount > 1 ? "s" : ""} redistribuida${reassignedCount > 1 ? "s" : ""}.`,
        );
      } else {
        toast.success("Disponibilidade atualizada");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao atualizar disponibilidade",
      );
    } finally {
      setUpdatingAvailability(false);
    }
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
            availability={(session.profile?.availability as AvailabilityStatus | undefined) ?? "online"}
            updatingAvailability={updatingAvailability}
            onAvailabilityChange={handleAvailabilityChange}
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
  availability,
  updatingAvailability,
  onAvailabilityChange,
}: {
  userName: string;
  tenantName: string;
  roleLabel: string;
  availability: AvailabilityStatus;
  updatingAvailability: boolean;
  onAvailabilityChange: (availability: AvailabilityStatus) => void;
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
      <div className="flex items-center gap-2">
        <Select
          value={availability}
          onValueChange={(value) => onAvailabilityChange(value as AvailabilityStatus)}
          disabled={updatingAvailability}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="Disponibilidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="busy">Ocupado</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
          </SelectContent>
        </Select>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          {roleLabel}
        </span>
      </div>
    </header>
  );
}

async function getAuthHeaders() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Sessao expirada");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}
