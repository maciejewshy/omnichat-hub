import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/settings/agents")({
  component: AgentsPage,
});

function AgentsPage() {
  const { data: members = [] } = useQuery({
    queryKey: ["tenant-members"],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("*");
      const { data: roles } = await supabase.from("user_roles").select("user_id,role");
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
      }));
    },
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Agentes</h1>
      <p className="mt-1 text-sm text-muted-foreground">Equipe da sua empresa</p>
      {members.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
          <Users className="h-10 w-10 opacity-30" />
          <p>Nenhum agente cadastrado.</p>
        </div>
      ) : (
        <div className="mt-6 rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papéis</TableHead>
                <TableHead>Disponibilidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.full_name || "—"}</TableCell>
                  <TableCell>{m.email}</TableCell>
                  <TableCell>
                    {m.roles.map((r) => (
                      <span key={r} className="mr-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {r}
                      </span>
                    ))}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1.5 text-xs ${m.availability === "online" ? "text-success" : "text-muted-foreground"}`}>
                      <span className={`h-2 w-2 rounded-full ${m.availability === "online" ? "bg-success" : "bg-muted-foreground"}`} />
                      {m.availability}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="mt-6 text-xs text-muted-foreground">
        Convite por e-mail será adicionado em uma próxima iteração. Por ora, peça que o agente se
        cadastre e depois ajuste o papel via banco.
      </p>
    </div>
  );
}
