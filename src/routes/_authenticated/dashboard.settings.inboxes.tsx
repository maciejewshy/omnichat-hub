import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Phone, Instagram, Facebook, Globe, Save, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useSession, isAdmin } from "@/lib/auth";
import {
  createOfficialConnectionConfig,
  getConnectionFields,
  getProviderLabel,
  type ChannelType,
  type InboxConnectionConfig,
} from "@/lib/inbox-connections";
import { RoleGuard } from "@/lib/role-guard";

export const Route = createFileRoute("/_authenticated/dashboard/settings/inboxes")({
  component: () => (
    <RoleGuard allow={["admin"]}>
      <InboxesPage />
    </RoleGuard>
  ),
});

const channelMeta: Record<ChannelType, { icon: typeof Phone; label: string; setupNote: string }> = {
  whatsapp: { icon: Phone, label: "WhatsApp", setupNote: "Conexão via QR Code ou API oficial (Meta)." },
  instagram: { icon: Instagram, label: "Instagram", setupNote: "Autenticação via Meta Graph API." },
  facebook: { icon: Facebook, label: "Facebook Messenger", setupNote: "Autenticação via Meta Graph API." },
  webchat: { icon: Globe, label: "Webchat (site)", setupNote: "Cole o snippet JS no seu site." },
  telegram: { icon: Send, label: "Telegram", setupNote: "Configure com o token do bot (@BotFather)." },
};

type InboxRow = {
  id: string;
  name: string;
  channel_type: ChannelType;
  is_active: boolean;
  config: unknown;
};

function InboxesPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const canEdit = isAdmin(session.roles);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<ChannelType>("webchat");
  const [setupOpen, setSetupOpen] = useState<string | null>(null);
  const [draftConfig, setDraftConfig] = useState<InboxConnectionConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingConfig, setTestingConfig] = useState(false);
  const [testResult, setTestResult] = useState<null | {
    status: string;
    provider: string;
    message: string;
    connectionOk: boolean;
    readiness: Array<{ key: string; label: string; ok: boolean }>;
    checks: Array<{ label: string; ok: boolean; detail?: string }>;
    external?: Record<string, string | number | boolean | null>;
  }>(null);

  const { data: inboxes = [] } = useQuery({
    queryKey: ["inboxes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inboxes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InboxRow[];
    },
  });

  const activeInbox = useMemo(
    () => inboxes.find((inbox) => inbox.id === setupOpen) ?? null,
    [inboxes, setupOpen],
  );

  const activeConnection = useMemo(() => {
    if (!activeInbox) return null;
    return createOfficialConnectionConfig(activeInbox.channel_type, activeInbox.id, activeInbox.config);
  }, [activeInbox]);

  useEffect(() => {
    setDraftConfig(activeConnection);
    setTestResult(null);
  }, [activeConnection]);

  useEffect(() => {
    if (!setupOpen || !activeInbox) return;

    let cancelled = false;
    setLoadingConfig(true);
    setTestResult(null);

    getAuthHeaders()
      .then((headers) =>
        fetch(`/api/connections/${activeInbox.id}`, {
          method: "GET",
          headers,
        }),
      )
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Falha ao carregar configuracao");
        }
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) {
          setDraftConfig(payload.config as InboxConnectionConfig);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Erro ao carregar configuracao");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingConfig(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeInbox, setupOpen]);

  async function createInbox() {
    if (!name || !session.profile?.tenant_id) return;
    const { data, error } = await supabase
      .from("inboxes")
      .insert({
      tenant_id: session.profile.tenant_id,
      name,
        channel_type: channel,
      })
      .select("id, channel_type, config")
      .single();
    if (error) return toast.error(error.message);

    if (data) {
      const config = createOfficialConnectionConfig(data.channel_type as ChannelType, data.id, data.config);
      const { error: configError } = await supabase.from("inboxes").update({ config }).eq("id", data.id);
      if (configError) return toast.error(configError.message);
    }

    toast.success("Caixa criada");
    setOpen(false);
    setName("");
    queryClient.invalidateQueries({ queryKey: ["inboxes"] });
  }

  async function saveConnectionConfig() {
    if (!activeInbox || !draftConfig) return;
    setSavingConfig(true);
    try {
      const nextConfig = createOfficialConnectionConfig(activeInbox.channel_type, activeInbox.id, draftConfig);
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/connections/${activeInbox.id}`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ config: nextConfig }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Falha ao salvar configuracao");
      }

      setDraftConfig(payload.config as InboxConnectionConfig);
      toast.success("Conexão oficial salva");
      queryClient.invalidateQueries({ queryKey: ["inboxes"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar configuracao");
    } finally {
      setSavingConfig(false);
    }
  }

  function updateDraftField(key: keyof InboxConnectionConfig, value: string) {
    if (!activeInbox || !draftConfig) return;
    const nextDraft = createOfficialConnectionConfig(activeInbox.channel_type, activeInbox.id, {
      ...draftConfig,
      [key]: value,
    });
    setDraftConfig(nextDraft);
  }

  async function testConnectionConfig() {
    if (!activeInbox) return;
    setTestingConfig(true);
    setTestResult(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/connections/${activeInbox.id}/test`, {
        method: "POST",
        headers,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Falha ao testar configuracao");
      }
      setTestResult(payload);
      toast.success("Teste executado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao testar configuracao");
    } finally {
      setTestingConfig(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Caixas de entrada</h1>
          <p className="mt-1 text-sm text-muted-foreground">Conecte seus canais de atendimento</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1.5">
                <Plus className="h-4 w-4" /> Adicionar caixa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova caixa de entrada</DialogTitle>
                <DialogDescription>Escolha o canal para receber conversas.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" placeholder="Ex: Atendimento" />
                </div>
                <div>
                  <Label>Canal</Label>
                  <Select value={channel} onValueChange={(v) => setChannel(v as never)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(channelMeta).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={createInbox}>Criar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {inboxes.map((i) => {
          const meta = channelMeta[i.channel_type];
          const Icon = meta?.icon ?? Globe;
          const connection = createOfficialConnectionConfig(i.channel_type, i.id, i.config);
          return (
            <Card key={i.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${i.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                    {i.is_active ? "ativa" : "inativa"}
                  </span>
                </div>
                <CardTitle className="mt-2 text-base">{i.name}</CardTitle>
                <CardDescription className="space-y-1">
                  <span className="block">{meta?.label}</span>
                  <span className="block text-xs">
                    Provider: {getProviderLabel(i.channel_type)}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Conexão oficial</span>
                  <span
                    className={`rounded-full px-2 py-0.5 ${
                      connection.status === "configured"
                        ? "bg-success/10 text-success"
                        : "bg-warning/10 text-warning"
                    }`}
                  >
                    {connection.status === "configured" ? "configurada" : "rascunho"}
                  </span>
                </div>
                <Button size="sm" variant="outline" className="w-full" onClick={() => setSetupOpen(i.id)}>
                  Configurar API oficial
                </Button>
              </CardContent>
            </Card>
          );
        })}
        {inboxes.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma caixa ainda.</p>
        )}
      </div>

      <Dialog open={!!setupOpen} onOpenChange={(v) => !v && setSetupOpen(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{activeInbox?.name}</DialogTitle>
            <DialogDescription>
              {activeInbox ? channelMeta[activeInbox.channel_type]?.setupNote : ""}
            </DialogDescription>
          </DialogHeader>

          {activeInbox && draftConfig && (
            <div className="space-y-5">
              <div className="rounded-lg border bg-secondary/30 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">Provider oficial:</span>
                  <span>{getProviderLabel(activeInbox.channel_type)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      draftConfig.status === "configured"
                        ? "bg-success/10 text-success"
                        : "bg-warning/10 text-warning"
                    }`}
                  >
                    {draftConfig.status === "configured" ? "Configurado" : "Configuracao incompleta"}
                  </span>
                </div>
              </div>

              {loadingConfig && (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Carregando configuracao protegida...
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {getConnectionFields(activeInbox.channel_type).map((field) => {
                  const value = draftConfig[field.key] ?? "";
                  const fullWidth = field.type === "textarea";

                  return (
                    <div key={field.key} className={fullWidth ? "sm:col-span-2" : ""}>
                      <Label>{field.label}</Label>
                      {field.type === "textarea" ? (
                        <Textarea
                          value={String(value)}
                          readOnly={field.readOnly}
                          rows={field.key === "snippet" ? 6 : 3}
                          onChange={(event) => updateDraftField(field.key, event.target.value)}
                          className="mt-1"
                          placeholder={field.placeholder}
                        />
                      ) : (
                        <Input
                          type={field.type ?? "text"}
                          value={String(value)}
                          readOnly={field.readOnly}
                          onChange={(event) => updateDraftField(field.key, event.target.value)}
                          className="mt-1"
                          placeholder={field.placeholder}
                        />
                      )}
                      {field.description && (
                        <p className="mt-1 text-xs text-muted-foreground">{field.description}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {testResult && (
                <div className="rounded-lg border bg-secondary/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span>{testResult.provider}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        testResult.connectionOk
                          ? "bg-success/10 text-success"
                          : "bg-warning/10 text-warning"
                      }`}
                    >
                      {testResult.connectionOk ? "conectado" : "pendente"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{testResult.message}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {testResult.readiness.map((item) => (
                      <div key={item.key} className="rounded-md border px-3 py-2 text-xs">
                        <div className="font-medium">{item.label}</div>
                        <div className={item.ok ? "text-success" : "text-warning"}>
                          {item.ok ? "ok" : "pendente"}
                        </div>
                      </div>
                    ))}
                  </div>
                  {testResult.checks.length > 0 && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {testResult.checks.map((item) => (
                        <div key={item.label} className="rounded-md border px-3 py-2 text-xs">
                          <div className="font-medium">{item.label}</div>
                          <div className={item.ok ? "text-success" : "text-warning"}>
                            {item.ok ? "ok" : "falhou"}
                          </div>
                          {item.detail && (
                            <div className="mt-1 text-muted-foreground">{item.detail}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {testResult.external && Object.keys(testResult.external).length > 0 && (
                    <div className="mt-3 rounded-md border px-3 py-2 text-xs">
                      <div className="font-medium">Dados retornados pelo provider</div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {Object.entries(testResult.external).map(([key, value]) => (
                          <div key={key}>
                            <div className="text-muted-foreground">{key}</div>
                            <div>{String(value)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupOpen(null)}>Fechar</Button>
            {canEdit && activeInbox && draftConfig && (
              <>
                <Button variant="outline" onClick={testConnectionConfig} disabled={testingConfig} className="gap-1.5">
                  <ShieldCheck className="h-4 w-4" /> Testar configuração
                </Button>
                <Button onClick={saveConnectionConfig} disabled={savingConfig} className="gap-1.5">
                  <Save className="h-4 w-4" /> Salvar configuração
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

async function getAuthHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Sessao expirada");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}
