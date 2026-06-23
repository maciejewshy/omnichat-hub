import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { isAdminOrManager, useSession } from "@/lib/auth";
import { RoleGuard } from "@/lib/role-guard";

export const Route = createFileRoute("/_authenticated/dashboard/settings/teams")({
  component: () => (
    <RoleGuard allow={["admin", "gerente"]}>
      <TeamsPage />
    </RoleGuard>
  ),
});

type TeamRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

type MemberRow = {
  id: string;
  full_name: string;
  email: string;
  availability: string;
};

type TeamMemberRow = {
  team_id: string;
  user_id: string;
};

function TeamsPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const canEdit = isAdminOrManager(session.roles);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as TeamRow[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["team-members-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, availability")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as MemberRow[];
    },
  });

  const { data: memberships = [] } = useQuery({
    queryKey: ["team-memberships"],
    queryFn: async () => {
      const { data, error } = await supabase.from("team_members").select("team_id, user_id");
      if (error) throw error;
      return (data ?? []) as TeamMemberRow[];
    },
  });

  useEffect(() => {
    if (!selectedTeamId && teams[0]?.id) {
      setSelectedTeamId(teams[0].id);
    }
    if (selectedTeamId && !teams.some((team) => team.id === selectedTeamId)) {
      setSelectedTeamId(teams[0]?.id ?? null);
    }
  }, [selectedTeamId, teams]);

  const membersByTeam = useMemo(() => {
    return memberships.reduce<Record<string, string[]>>((acc, membership) => {
      acc[membership.team_id] = [...(acc[membership.team_id] ?? []), membership.user_id];
      return acc;
    }, {});
  }, [memberships]);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;
  const selectedMemberIds = new Set(selectedTeamId ? membersByTeam[selectedTeamId] ?? [] : []);

  async function createTeam() {
    if (!canEdit || !session.profile?.tenant_id || !name.trim()) return;
    const { error } = await supabase.from("teams").insert({
      tenant_id: session.profile.tenant_id,
      name: name.trim(),
      description: description.trim() || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    setDescription("");
    toast.success("Equipe criada");
    queryClient.invalidateQueries({ queryKey: ["teams"] });
  }

  async function deleteTeam(teamId: string) {
    if (!canEdit) return;
    const { error } = await supabase.from("teams").delete().eq("id", teamId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Equipe removida");
    queryClient.invalidateQueries({ queryKey: ["teams"] });
    queryClient.invalidateQueries({ queryKey: ["team-memberships"] });
  }

  async function toggleMember(userId: string) {
    if (!canEdit || !selectedTeamId) return;
    const alreadyAssigned = selectedMemberIds.has(userId);

    const result = alreadyAssigned
      ? await supabase
          .from("team_members")
          .delete()
          .eq("team_id", selectedTeamId)
          .eq("user_id", userId)
      : await supabase.from("team_members").insert({ team_id: selectedTeamId, user_id: userId });

    if (result.error) {
      toast.error(result.error.message);
      return;
    }

    toast.success(alreadyAssigned ? "Membro removido da equipe" : "Membro adicionado a equipe");
    queryClient.invalidateQueries({ queryKey: ["team-memberships"] });
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Equipes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize agentes por setor e distribua o atendimento.
          </p>
        </div>
      </div>

      {canEdit && (
        <Card className="mt-6 max-w-2xl">
          <CardHeader>
            <CardTitle>Nova equipe</CardTitle>
            <CardDescription>Crie áreas como Vendas, Suporte ou Financeiro.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1"
                placeholder="Ex: Suporte N1"
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="mt-1"
                rows={3}
                placeholder="Responsável por primeiros atendimentos e triagem."
              />
            </div>
            <Button onClick={createTeam} className="gap-1.5">
              <Plus className="h-4 w-4" /> Criar equipe
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          {teams.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhuma equipe criada ainda.
            </div>
          )}

          {teams.map((team) => {
            const teamMemberCount = membersByTeam[team.id]?.length ?? 0;
            const active = selectedTeamId === team.id;

            return (
              <button
                key={team.id}
                type="button"
                onClick={() => setSelectedTeamId(team.id)}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  active ? "border-primary bg-primary/5" : "hover:border-primary/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{team.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {team.description || "Sem descricao"}
                    </p>
                  </div>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteTeam(team.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  <span>{teamMemberCount} membro(s)</span>
                </div>
              </button>
            );
          })}
        </div>

        <Card className="min-h-[420px]">
          <CardHeader>
            <CardTitle>{selectedTeam?.name ?? "Membros da equipe"}</CardTitle>
            <CardDescription>
              {selectedTeam
                ? "Adicione ou remova agentes desta equipe."
                : "Selecione uma equipe para gerenciar os membros."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedTeam && (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                Escolha uma equipe na coluna ao lado.
              </div>
            )}

            {selectedTeam && (
              <div className="space-y-3">
                {members.map((member) => {
                  const checked = selectedMemberIds.has(member.id);
                  return (
                    <label
                      key={member.id}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition hover:border-primary/40"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!canEdit}
                        onChange={() => toggleMember(member.id)}
                        className="mt-1 h-4 w-4 rounded border-input"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-medium">{member.full_name || "Sem nome"}</p>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                              member.availability === "online"
                                ? "bg-success/10 text-success"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {member.availability}
                          </span>
                        </div>
                        <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                      </div>
                    </label>
                  );
                })}

                {members.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum agente disponivel para vincular.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
