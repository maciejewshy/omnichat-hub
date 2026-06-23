import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { type Database } from "@/integrations/supabase/types";
import { isAdminOrManager, useSession } from "@/lib/auth";
import { RoleGuard } from "@/lib/role-guard";

type ChannelType = Database["public"]["Enums"]["channel_type"];

type RoutingRuleRow = Database["public"]["Tables"]["routing_rules"]["Row"] & {
  teams: { id: string; name: string } | null;
};

type TeamRow = Database["public"]["Tables"]["teams"]["Row"];
type InboxRow = Database["public"]["Tables"]["inboxes"]["Row"];
type TeamMemberRow = Database["public"]["Tables"]["team_members"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type PrefRow = Database["public"]["Tables"]["agent_routing_preferences"]["Row"];

const CHANNEL_OPTIONS: Array<{ value: ChannelType; label: string }> = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "telegram", label: "Telegram" },
  { value: "webchat", label: "Webchat" },
];

export const Route = createFileRoute("/_authenticated/dashboard/settings/routing")({
  component: () => (
    <RoleGuard allow={["admin", "gerente"]}>
      <RoutingSettingsPage />
    </RoleGuard>
  ),
});

function RoutingSettingsPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const canEdit = isAdminOrManager(session.roles);
  const [ruleName, setRuleName] = useState("");
  const [ruleTeamId, setRuleTeamId] = useState<string>("");
  const [ruleStrategy, setRuleStrategy] = useState<"round_robin" | "least_loaded">("round_robin");
  const [rulePriority, setRulePriority] = useState("100");
  const [ruleChannels, setRuleChannels] = useState<ChannelType[]>([]);
  const [ruleInboxIds, setRuleInboxIds] = useState<string[]>([]);
  const [draftPrefs, setDraftPrefs] = useState<
    Record<string, { autoAssign: boolean; maxOpenConversations: number; allowedChannels: ChannelType[]; allowedInboxIds: string[] }>
  >({});

  const { data: teams = [] } = useQuery({
    queryKey: ["routing-teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as TeamRow[];
    },
  });

  const { data: inboxes = [] } = useQuery({
    queryKey: ["routing-inboxes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inboxes")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as InboxRow[];
    },
  });

  const { data: rules = [] } = useQuery({
    queryKey: ["routing-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routing_rules")
        .select("*, teams(id, name)")
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as RoutingRuleRow[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["routing-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });

  const { data: memberships = [] } = useQuery({
    queryKey: ["routing-team-memberships"],
    queryFn: async () => {
      const { data, error } = await supabase.from("team_members").select("*");
      if (error) throw error;
      return (data ?? []) as TeamMemberRow[];
    },
  });

  const { data: preferences = [] } = useQuery({
    queryKey: ["routing-agent-prefs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_routing_preferences")
        .select("*");
      if (error) throw error;
      return (data ?? []) as PrefRow[];
    },
  });

  useEffect(() => {
    setDraftPrefs((current) => {
      const next = { ...current };
      for (const profile of profiles) {
        const pref = preferences.find((item) => item.user_id === profile.id);
        next[profile.id] = current[profile.id] ?? {
          autoAssign: pref?.auto_assign ?? true,
          maxOpenConversations: pref?.max_open_conversations ?? 10,
          allowedChannels: pref?.allowed_channels ?? [],
          allowedInboxIds: pref?.allowed_inbox_ids ?? [],
        };
      }
      return next;
    });
  }, [preferences, profiles]);

  const teamsByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const membership of memberships) {
      const current = map.get(membership.user_id) ?? [];
      map.set(membership.user_id, [...current, membership.team_id]);
    }
    return map;
  }, [memberships]);

  async function createRule() {
    if (!canEdit || !session.profile?.tenant_id || !ruleName.trim() || !ruleTeamId) return;

    const { error } = await supabase.from("routing_rules").insert({
      tenant_id: session.profile.tenant_id,
      team_id: ruleTeamId,
      name: ruleName.trim(),
      strategy: ruleStrategy,
      priority: Number(rulePriority) || 100,
      channel_types: ruleChannels,
      inbox_ids: ruleInboxIds,
      is_active: true,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    setRuleName("");
    setRuleTeamId("");
    setRuleStrategy("round_robin");
    setRulePriority("100");
    setRuleChannels([]);
    setRuleInboxIds([]);
    toast.success("Regra de roteamento criada");
    queryClient.invalidateQueries({ queryKey: ["routing-rules"] });
  }

  async function deleteRule(ruleId: string) {
    if (!canEdit) return;
    const { error } = await supabase.from("routing_rules").delete().eq("id", ruleId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Regra removida");
    queryClient.invalidateQueries({ queryKey: ["routing-rules"] });
  }

  async function savePreference(userId: string) {
    if (!canEdit || !session.profile?.tenant_id) return;
    const draft = draftPrefs[userId];
    if (!draft) return;

    const { error } = await supabase.from("agent_routing_preferences").upsert({
      user_id: userId,
      tenant_id: session.profile.tenant_id,
      auto_assign: draft.autoAssign,
      max_open_conversations: draft.maxOpenConversations,
      allowed_channels: draft.allowedChannels,
      allowed_inbox_ids: draft.allowedInboxIds,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Preferencias salvas");
    queryClient.invalidateQueries({ queryKey: ["routing-agent-prefs"] });
  }

  function toggleChannel(list: ChannelType[], value: ChannelType) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function toggleInbox(list: string[], value: string) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  return (
    <div className="p-6">
      <div>
        <h1 className="text-2xl font-semibold">Roteamento</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Defina para qual equipe cada chat vai e quais agentes podem receber distribuicao automatica.
        </p>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Nova regra</CardTitle>
          <CardDescription>
            O sistema tenta a regra mais especifica primeiro e usa a prioridade como desempate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <Label>Nome</Label>
              <Input value={ruleName} onChange={(event) => setRuleName(event.target.value)} className="mt-1" placeholder="Ex: WhatsApp Suporte" />
            </div>
            <div>
              <Label>Equipe</Label>
              <Select value={ruleTeamId} onValueChange={setRuleTeamId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione a equipe" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estrategia</Label>
              <Select value={ruleStrategy} onValueChange={(value) => setRuleStrategy(value as "round_robin" | "least_loaded")}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="round_robin">Round robin</SelectItem>
                  <SelectItem value="least_loaded">Menor carga</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Input
                value={rulePriority}
                onChange={(event) => setRulePriority(event.target.value)}
                className="mt-1"
                inputMode="numeric"
                placeholder="100"
              />
            </div>
          </div>

          <div>
            <Label>Canais</Label>
            <div className="mt-2 flex flex-wrap gap-3">
              {CHANNEL_OPTIONS.map((channel) => (
                <label key={channel.value} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox
                    checked={ruleChannels.includes(channel.value)}
                    onCheckedChange={() => setRuleChannels((current) => toggleChannel(current, channel.value))}
                  />
                  {channel.label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Deixe vazio para aceitar qualquer canal.</p>
          </div>

          <div>
            <Label>Caixas de entrada</Label>
            <div className="mt-2 flex flex-wrap gap-3">
              {inboxes.map((inbox) => (
                <label key={inbox.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox
                    checked={ruleInboxIds.includes(inbox.id)}
                    onCheckedChange={() => setRuleInboxIds((current) => toggleInbox(current, inbox.id))}
                  />
                  {inbox.name}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Deixe vazio para aceitar qualquer inbox.</p>
          </div>

          <Button onClick={createRule} className="gap-2">
            <Workflow className="h-4 w-4" /> Criar regra
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Regras ativas</CardTitle>
          <CardDescription>Estas regras definem a equipe inicial e a estrategia de atribuicao.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rules.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhuma regra configurada ainda.
            </div>
          )}

          {rules.map((rule) => (
            <div key={rule.id} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{rule.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Equipe: {rule.teams?.name ?? "Sem equipe"} · Estrategia: {rule.strategy} · Prioridade: {rule.priority}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteRule(rule.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(rule.channel_types.length > 0 ? rule.channel_types : ["todos os canais"]).map((item) => (
                  <Badge key={`${rule.id}-${item}`} variant="secondary">
                    {item}
                  </Badge>
                ))}
                {(rule.inbox_ids.length > 0
                  ? rule.inbox_ids.map((id) => inboxes.find((inbox) => inbox.id === id)?.name ?? id)
                  : ["todas as inboxes"]).map((item) => (
                  <Badge key={`${rule.id}-${item}`} variant="outline">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Preferencias dos agentes</CardTitle>
          <CardDescription>
            Controle quem entra na distribuicao automatica, com filtros de canal e limite maximo de conversas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {profiles.map((profile) => {
            const pref = draftPrefs[profile.id];
            const teamIds = teamsByUser.get(profile.id) ?? [];
            const teamNames = teamIds.map((teamId) => teams.find((team) => team.id === teamId)?.name ?? teamId);

            return (
              <div key={profile.id} className="rounded-xl border p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="font-medium">{profile.full_name || profile.email}</p>
                    <p className="text-sm text-muted-foreground">{profile.email}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant={profile.availability === "online" ? "default" : "secondary"}>
                        {profile.availability}
                      </Badge>
                      {teamNames.length > 0 ? (
                        teamNames.map((teamName) => (
                          <Badge key={`${profile.id}-${teamName}`} variant="outline">
                            {teamName}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline">Sem equipe</Badge>
                      )}
                    </div>
                  </div>

                  {pref && (
                    <div className="w-full max-w-3xl space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                          <Checkbox
                            checked={pref.autoAssign}
                            onCheckedChange={(checked) =>
                              setDraftPrefs((current) => ({
                                ...current,
                                [profile.id]: {
                                  ...current[profile.id],
                                  autoAssign: Boolean(checked),
                                },
                              }))
                            }
                          />
                          Participa da distribuicao automatica
                        </label>
                        <div>
                          <Label>Maximo de chats abertos</Label>
                          <Input
                            className="mt-1"
                            inputMode="numeric"
                            value={String(pref.maxOpenConversations)}
                            onChange={(event) =>
                              setDraftPrefs((current) => ({
                                ...current,
                                [profile.id]: {
                                  ...current[profile.id],
                                  maxOpenConversations: Number(event.target.value) || 0,
                                },
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div>
                        <Label>Canais permitidos</Label>
                        <div className="mt-2 flex flex-wrap gap-3">
                          {CHANNEL_OPTIONS.map((channel) => (
                            <label key={`${profile.id}-${channel.value}`} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                              <Checkbox
                                checked={pref.allowedChannels.includes(channel.value)}
                                onCheckedChange={() =>
                                  setDraftPrefs((current) => ({
                                    ...current,
                                    [profile.id]: {
                                      ...current[profile.id],
                                      allowedChannels: toggleChannel(current[profile.id].allowedChannels, channel.value),
                                    },
                                  }))
                                }
                              />
                              {channel.label}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <Label>Inboxes permitidas</Label>
                        <div className="mt-2 flex flex-wrap gap-3">
                          {inboxes.map((inbox) => (
                            <label key={`${profile.id}-${inbox.id}`} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                              <Checkbox
                                checked={pref.allowedInboxIds.includes(inbox.id)}
                                onCheckedChange={() =>
                                  setDraftPrefs((current) => ({
                                    ...current,
                                    [profile.id]: {
                                      ...current[profile.id],
                                      allowedInboxIds: toggleInbox(current[profile.id].allowedInboxIds, inbox.id),
                                    },
                                  }))
                                }
                              />
                              {inbox.name}
                            </label>
                          ))}
                        </div>
                      </div>

                      <Button onClick={() => savePreference(profile.id)} className="gap-2">
                        <Save className="h-4 w-4" /> Salvar preferencias
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
