import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Phone, Instagram, Facebook, Globe, Send, QrCode, Code, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

import { RoleGuard } from "@/lib/role-guard";

export const Route = createFileRoute("/_authenticated/dashboard/settings/inboxes")({
  component: () => (
    <RoleGuard allow={["admin"]}>
      <InboxesPage />
    </RoleGuard>
  ),
});

const channelMeta: Record<string, { icon: typeof Phone; label: string; setupNote: string }> = {
  whatsapp: { icon: Phone, label: "WhatsApp", setupNote: "Conexão via QR Code ou API oficial (Meta)." },
  instagram: { icon: Instagram, label: "Instagram", setupNote: "Autenticação via Meta Graph API." },
  facebook: { icon: Facebook, label: "Facebook Messenger", setupNote: "Autenticação via Meta Graph API." },
  webchat: { icon: Globe, label: "Webchat (site)", setupNote: "Cole o snippet JS no seu site." },
  telegram: { icon: Send, label: "Telegram", setupNote: "Configure com o token do bot (@BotFather)." },
};

function InboxesPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const canEdit = isAdmin(session.roles);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<keyof typeof channelMeta>("webchat");
  const [setupOpen, setSetupOpen] = useState<string | null>(null);

  const { data: inboxes = [] } = useQuery({
    queryKey: ["inboxes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inboxes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function createInbox() {
    if (!name || !session.profile?.tenant_id) return;
    const { error } = await supabase.from("inboxes").insert({
      tenant_id: session.profile.tenant_id,
      name,
      channel_type: channel as "facebook" | "instagram" | "telegram" | "webchat" | "whatsapp",
    });
    if (error) return toast.error(error.message);
    toast.success("Caixa criada");
    setOpen(false);
    setName("");
    queryClient.invalidateQueries({ queryKey: ["inboxes"] });
  }

  const activeInbox = inboxes.find((i) => i.id === setupOpen);

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
          const meta = channelMeta[i.channel_type as keyof typeof channelMeta];
          const Icon = meta?.icon ?? Globe;
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
                <CardDescription>{meta?.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button size="sm" variant="outline" className="w-full" onClick={() => setSetupOpen(i.id)}>
                  Configurar conexão
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeInbox?.name}</DialogTitle>
            <DialogDescription>
              {channelMeta[activeInbox?.channel_type as keyof typeof channelMeta]?.setupNote}
            </DialogDescription>
          </DialogHeader>
          {activeInbox && <SetupContent channel={activeInbox.channel_type} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupOpen(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SetupContent({ channel }: { channel: string }) {
  if (channel === "whatsapp") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-secondary/40 p-6 text-center">
        <QrCode className="h-32 w-32 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Em produção, este QR Code seria lido pelo WhatsApp do seu celular para parear a conta.
        </p>
      </div>
    );
  }
  if (channel === "webchat") {
    const snippet = `<script src="https://cdn.flowchat.app/widget.js"\n  data-inbox-id="SUA_INBOX_ID" async></script>`;
    return (
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5"><Code className="h-4 w-4" /> Snippet</Label>
        <pre className="overflow-x-auto rounded-lg bg-nav p-3 text-xs text-nav-foreground">
          <code>{snippet}</code>
        </pre>
        <p className="text-xs text-muted-foreground">Cole antes de &lt;/body&gt; no seu site.</p>
      </div>
    );
  }
  if (channel === "telegram") {
    return (
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5"><KeyRound className="h-4 w-4" /> Token do bot</Label>
        <Input placeholder="123456:ABC-DEF..." />
        <p className="text-xs text-muted-foreground">Obtenha em @BotFather.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-secondary/40 p-4 text-sm text-muted-foreground">
      Faça login com sua conta Meta para conectar este canal.
    </div>
  );
}
