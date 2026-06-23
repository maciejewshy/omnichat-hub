import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, Building2 } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { RoleGuard } from "@/lib/role-guard";

export const Route = createFileRoute("/_authenticated/dashboard/superadmin")({
  head: () => ({ meta: [{ title: "Superadmin — FlowChat" }] }),
  component: () => (
    <RoleGuard allow={["superadmin"]}>
      <SuperadminPage />
    </RoleGuard>
  ),
});

function SuperadminPage() {
  const queryClient = useQueryClient();

  const { data: tenants = [] } = useQuery({
    queryKey: ["all-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function toggleStatus(id: string, status: string) {
    const next = status === "active" ? "suspended" : "active";
    const { error } = await supabase.from("tenants").update({ status: next as never }).eq("id", id);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["all-tenants"] });
    toast.success(`Tenant ${next === "active" ? "ativado" : "suspenso"}`);
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/15 text-warning">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Painel Superadmin</h1>
          <p className="text-sm text-muted-foreground">{tenants.length} empresas ativas</p>
        </div>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Agentes</TableHead>
              <TableHead>Criada</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {t.name}
                  </div>
                </TableCell>
                <TableCell>{t.plan}</TableCell>
                <TableCell>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      t.status === "active"
                        ? "bg-success/10 text-success"
                        : t.status === "suspended"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-warning/10 text-warning"
                    }`}
                  >
                    {t.status}
                  </span>
                </TableCell>
                <TableCell>{t.max_agents}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(t.created_at).toLocaleDateString("pt-BR")}
                </TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" onClick={() => toggleStatus(t.id, t.status)}>
                    {t.status === "active" ? "Suspender" : "Ativar"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
