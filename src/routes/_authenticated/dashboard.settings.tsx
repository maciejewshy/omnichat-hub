import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Building2, Inbox as InboxIcon, Tag, Users, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/settings")({
  head: () => ({ meta: [{ title: "Configurações — FlowChat" }] }),
  component: SettingsLayout,
});

function SettingsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = [
    { to: "/dashboard/settings", label: "Geral", icon: Building2, exact: true },
    { to: "/dashboard/settings/inboxes", label: "Caixas de entrada", icon: InboxIcon },
    { to: "/dashboard/settings/agents", label: "Agentes", icon: Users },
    { to: "/dashboard/settings/labels", label: "Labels", icon: Tag },
    { to: "/dashboard/settings/canned", label: "Respostas rápidas", icon: Zap },
    { to: "/dashboard/settings/bot", label: "Bot builder", icon: Bot },
  ];
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-64 shrink-0 border-r bg-secondary/30">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Configurações</h2>
        </div>
        <nav className="flex flex-col gap-0.5 p-2 text-sm">
          {items.map((it) => {
            const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 transition",
                  active ? "bg-primary/10 font-medium text-primary" : "hover:bg-secondary",
                )}
              >
                <it.icon className="h-4 w-4" /> {it.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
