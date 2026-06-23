import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Send,
  Paperclip,
  Lock,
  Check,
  CheckCheck,
  CircleAlert,
  Hand,
  Bot,
  Globe,
  Phone,
  Instagram,
  Facebook,
  Filter,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useSession, isAdminOrManager } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({ meta: [{ title: "Conversas — FlowChat" }] }),
  component: ConversationsPage,
});

type ConvRow = {
  id: string;
  status: "open" | "pending" | "resolved" | "snoozed";
  assignee_id: string | null;
  team_id: string | null;
  inbox_id: string;
  contact_id: string;
  last_activity_at: string;
  unread_count: number;
  labels: string[];
  contacts: { id: string; name: string; phone: string | null; email: string | null; avatar_url: string | null } | null;
  inboxes: { id: string; name: string; channel_type: string } | null;
};

type Filter = "mine" | "unassigned" | "all";

function ConversationsPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("mine");
  const [statusFilter, setStatusFilter] = useState<"open" | "resolved" | "pending" | "all">("open");
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: conversations = [], refetch } = useQuery({
    queryKey: ["conversations", filter, statusFilter, session.user?.id],
    queryFn: async () => {
      let q = supabase
        .from("conversations")
        .select(
          "id,status,assignee_id,team_id,inbox_id,contact_id,last_activity_at,unread_count,labels,contacts(id,name,phone,email,avatar_url),inboxes(id,name,channel_type)",
        )
        .order("last_activity_at", { ascending: false })
        .limit(100);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (filter === "mine" && session.user?.id) q = q.eq("assignee_id", session.user.id);
      if (filter === "unassigned") q = q.is("assignee_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ConvRow[];
    },
    enabled: !!session.user?.id,
  });

  useEffect(() => {
    if (!activeId && conversations[0]) setActiveId(conversations[0].id);
  }, [conversations, activeId]);

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

  // Empty state setup: create a demo conversation
  async function seedDemoConversation() {
    if (!session.profile?.tenant_id) return;
    const { data: inbox } = await supabase
      .from("inboxes")
      .select("id")
      .eq("tenant_id", session.profile.tenant_id)
      .limit(1)
      .maybeSingle();
    if (!inbox) {
      toast.error("Crie uma caixa de entrada primeiro");
      return;
    }
    const { data: contact, error: cErr } = await supabase
      .from("contacts")
      .insert({
        tenant_id: session.profile.tenant_id,
        name: "Maria Silva",
        phone: "+5511999990000",
        email: "maria@exemplo.com",
        created_by: session.user!.id,
      })
      .select("id")
      .single();
    if (cErr || !contact) return toast.error(cErr?.message ?? "Erro ao criar contato");
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .insert({
        tenant_id: session.profile.tenant_id,
        inbox_id: inbox.id,
        contact_id: contact.id,
        status: "open",
        unread_count: 1,
      })
      .select("id")
      .single();
    if (convErr || !conv) return toast.error(convErr?.message ?? "Erro ao criar conversa");
    await supabase.from("messages").insert([
      {
        tenant_id: session.profile.tenant_id,
        conversation_id: conv.id,
        sender_type: "contact",
        content: "Olá! Vocês fazem entrega no fim de semana?",
      },
    ]);
    toast.success("Conversa demo criada");
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    setActiveId(conv.id);
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Secondary sidebar: filters */}
      <aside className="w-64 shrink-0 border-r bg-secondary/30">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Conversas</h2>
        </div>
        <nav className="flex flex-col gap-0.5 p-2 text-sm">
          {[
            { key: "mine" as const, label: "Atribuídas a mim" },
            { key: "unassigned" as const, label: "Não atribuídas" },
            ...(isAdminOrManager(session.roles) ? [{ key: "all" as const, label: "Todas" }] : []),
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-3 py-2 text-left transition",
                filter === f.key ? "bg-primary/10 font-medium text-primary" : "hover:bg-secondary",
              )}
            >
              {f.label}
            </button>
          ))}
        </nav>
        <div className="border-t px-3 py-2">
          <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Status
          </p>
          <div className="mt-1 flex flex-col gap-0.5 text-sm">
            {[
              { key: "open" as const, label: "Aberta", color: "bg-info" },
              { key: "pending" as const, label: "Pendente", color: "bg-warning" },
              { key: "resolved" as const, label: "Resolvida", color: "bg-success" },
              { key: "all" as const, label: "Todas", color: "bg-muted-foreground" },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-left transition",
                  statusFilter === s.key ? "bg-secondary font-medium" : "hover:bg-secondary",
                )}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${s.color}`} />
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* List */}
      <section className="flex w-80 shrink-0 flex-col border-r">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium text-muted-foreground">
            {conversations.length} conversa{conversations.length !== 1 && "s"}
          </span>
          <Filter className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground">
              <p>Nenhuma conversa por enquanto.</p>
              <Button variant="outline" size="sm" onClick={seedDemoConversation}>
                Criar conversa demo
              </Button>
            </div>
          ) : (
            conversations.map((c) => (
              <ConversationListItem
                key={c.id}
                conv={c}
                active={c.id === activeId}
                onClick={() => setActiveId(c.id)}
              />
            ))
          )}
        </div>
      </section>

      {/* Main panel */}
      <section className="flex min-w-0 flex-1 flex-col">
        {activeConv ? (
          <ConversationView
            conv={activeConv}
            onRefresh={() => {
              refetch();
              queryClient.invalidateQueries({ queryKey: ["messages", activeConv.id] });
            }}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Selecione uma conversa para começar
          </div>
        )}
      </section>

      {/* Contact context */}
      {activeConv && <ContactPanel conv={activeConv} />}
    </div>
  );
}

function channelIcon(type?: string) {
  switch (type) {
    case "whatsapp":
      return Phone;
    case "instagram":
      return Instagram;
    case "facebook":
      return Facebook;
    case "telegram":
      return Send;
    default:
      return Globe;
  }
}

function statusBorder(status: string) {
  switch (status) {
    case "open":
      return "border-l-info";
    case "pending":
      return "border-l-warning";
    case "resolved":
      return "border-l-success";
    default:
      return "border-l-muted";
  }
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

function ConversationListItem({
  conv,
  active,
  onClick,
}: {
  conv: ConvRow;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = channelIcon(conv.inboxes?.channel_type);
  const initials = (conv.contacts?.name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 border-b border-l-4 px-4 py-3 text-left transition",
        statusBorder(conv.status),
        active ? "bg-secondary" : "hover:bg-secondary/50",
      )}
    >
      <div className="relative">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {initials}
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-muted">
          <Icon className="h-2.5 w-2.5" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">{conv.contacts?.name ?? "Sem nome"}</p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(conv.last_activity_at), { addSuffix: false, locale: ptBR })}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{conv.inboxes?.name}</p>
        {conv.unread_count > 0 && (
          <span className="mt-1 inline-block rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
            {conv.unread_count}
          </span>
        )}
      </div>
    </button>
  );
}

function ConversationView({ conv, onRefresh }: { conv: ConvRow; onRefresh: () => void }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const canManage = isAdminOrManager(session.roles);
  const [tab, setTab] = useState<"reply" | "private">("reply");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [redistributing, setRedistributing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", conv.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5000,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["conversation-teams"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["conversation-agents"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const Icon = channelIcon(conv.inboxes?.channel_type);
  const currentTeam = teams.find((team) => team.id === conv.team_id) ?? null;
  const currentAssignee = agents.find((agent) => agent.id === conv.assignee_id) ?? null;

  async function send() {
    if (!text.trim() || !session.profile?.tenant_id) return;
    setSending(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/conversations/${conv.id}/messages`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: text,
          isPrivate: tab === "private",
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Erro ao enviar mensagem",
        );
      }

      setText("");
      queryClient.invalidateQueries({ queryKey: ["messages", conv.id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (tab === "private") {
        toast.success("Nota privada adicionada");
      } else if (payload && typeof payload === "object" && "delivery" in payload) {
        const delivery = typeof payload.delivery === "string" ? payload.delivery : "local_only";
        if (delivery === "telegram") toast.success("Mensagem enviada via Telegram");
        else if (delivery === "whatsapp") toast.success("Mensagem enviada via WhatsApp");
        else if (delivery === "instagram") toast.success("Mensagem enviada via Instagram");
        else if (delivery === "facebook") toast.success("Mensagem enviada via Facebook");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  }

  async function redistributeConversation() {
    setRedistributing(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/conversations/${conv.id}/redistribute`, {
        method: "POST",
        headers,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Erro ao redistribuir conversa",
        );
      }

      if (payload && typeof payload === "object" && "changed" in payload && payload.changed === false) {
        toast.success("Nenhuma redistribuicao necessaria");
      } else {
        toast.success("Conversa redistribuida");
      }

      onRefresh();
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao redistribuir conversa");
    } finally {
      setRedistributing(false);
    }
  }

  async function assignToMe() {
    if (!session.user) return;
    const { error } = await supabase
      .from("conversations")
      .update({ assignee_id: session.user.id })
      .eq("id", conv.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Conversa assumida");
      onRefresh();
    }
  }

  async function changeStatus(status: "open" | "pending" | "resolved" | "snoozed") {
    const { error } = await supabase.from("conversations").update({ status }).eq("id", conv.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Status atualizado");
      onRefresh();
    }
  }

  async function changeTeam(teamId: string | null) {
    const { error } = await supabase.from("conversations").update({ team_id: teamId }).eq("id", conv.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(teamId ? "Equipe atribuida" : "Equipe removida");
    onRefresh();
  }

  async function changeAssignee(userId: string | null) {
    const { error } = await supabase
      .from("conversations")
      .update({ assignee_id: userId })
      .eq("id", conv.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(userId ? "Agente atribuido" : "Atribuicao removida");
    onRefresh();
  }

  return (
    <>
      <header className="flex items-center justify-between border-b px-5 py-3">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">{conv.contacts?.name}</p>
            <p className="text-xs text-muted-foreground">{conv.inboxes?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conv.assignee_id === null && (
            <Button size="sm" variant="outline" onClick={assignToMe} className="gap-1.5">
              <Hand className="h-3.5 w-3.5" /> Assumir
            </Button>
          )}
          {(canManage || conv.assignee_id === session.user?.id || conv.assignee_id === null) && (
            <Button
              size="sm"
              variant="outline"
              onClick={redistributeConversation}
              className="gap-1.5"
              disabled={redistributing}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", redistributing && "animate-spin")} />
              Redistribuir
            </Button>
          )}
          {canManage && (
            <Select
              value={conv.assignee_id ?? "unassigned"}
              onValueChange={(value) => changeAssignee(value === "unassigned" ? null : value)}
            >
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Agente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Sem agente</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.full_name || agent.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {canManage && (
            <Select
              value={conv.team_id ?? "no-team"}
              onValueChange={(value) => changeTeam(value === "no-team" ? null : value)}
            >
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="Equipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no-team">Sem equipe</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={conv.status} onValueChange={(v) => changeStatus(v as never)}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Aberta</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="resolved">Resolvida</SelectItem>
              <SelectItem value="snoozed">Adiada</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="default" className="gap-1.5" onClick={() => changeStatus("resolved")}>
            <CheckCheck className="h-3.5 w-3.5" /> Resolver
          </Button>
        </div>
      </header>

      {!canManage && (currentTeam || conv.assignee_id) && (
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2 text-xs text-muted-foreground">
          {currentAssignee && (
            <span className="rounded-full bg-secondary px-2 py-1">
              Agente: {currentAssignee.full_name || currentAssignee.email}
            </span>
          )}
          {currentTeam && (
            <span className="rounded-full bg-secondary px-2 py-1">
              Equipe: {currentTeam.name}
            </span>
          )}
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-secondary/20 px-6 py-5">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
        )}
      </div>

      <div className="border-t bg-background">
        <div className="flex gap-1 border-b px-3 pt-2 text-xs">
          {[
            { key: "reply" as const, label: "Responder" },
            { key: "private" as const, label: "Nota privada" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-t-md border-b-2 px-3 py-1.5 font-medium transition",
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label === "Nota privada" && <Lock className="mr-1 inline h-3 w-3" />}
              {t.label}
            </button>
          ))}
        </div>
        <div
          className={cn(
            "flex flex-col gap-2 p-3",
            tab === "private" && "bg-chat-private/40",
          )}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              tab === "reply"
                ? "Digite sua mensagem… (Cmd/Ctrl+Enter envia · /atalho para respostas rápidas)"
                : "Nota interna, visível apenas para a equipe…"
            }
            className="min-h-[80px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <Paperclip className="h-4 w-4" /> Anexar
            </Button>
            <Button onClick={send} disabled={sending || !text.trim()} className="gap-1.5">
              <Send className="h-4 w-4" /> {tab === "private" ? "Adicionar nota" : "Enviar"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function MessageBubble({
  message,
}: {
  message: {
    sender_type: string;
    content: string;
    is_private: boolean;
    created_at: string;
    attachments?: unknown;
  };
}) {
  const isAgent = message.sender_type === "agent" || message.sender_type === "bot";
  const delivery = getMessageDelivery(message.attachments);
  if (message.is_private) {
    return (
      <div className="mx-auto max-w-[80%] rounded-lg border border-warning/30 bg-chat-private p-3 text-sm text-chat-private-foreground">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold opacity-80">
          <Lock className="h-3 w-3" /> Nota privada
        </p>
        {message.content}
      </div>
    );
  }
  return (
    <div className={cn("flex", isAgent ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[70%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
          isAgent
            ? "rounded-br-sm bg-chat-agent text-chat-agent-foreground"
            : "rounded-bl-sm bg-chat-contact text-chat-contact-foreground",
        )}
      >
        {message.sender_type === "bot" && (
          <p className="mb-1 flex items-center gap-1 text-xs opacity-80">
            <Bot className="h-3 w-3" /> Bot
          </p>
        )}
        <p className="whitespace-pre-wrap">{message.content}</p>
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
          {delivery && isAgent && (
            <span className="inline-flex items-center gap-1">
              <delivery.icon className={cn("h-3 w-3", delivery.className)} />
              <span>{delivery.label}</span>
            </span>
          )}
          <span>
            {new Date(message.created_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
    </div>
  );
}

function getMessageDelivery(attachments: unknown) {
  if (!Array.isArray(attachments)) return null;

  const withDelivery = attachments.find(
    (attachment) =>
      attachment &&
      typeof attachment === "object" &&
      "delivery" in attachment &&
      typeof attachment.delivery === "string",
  ) as { delivery?: string } | undefined;

  switch (withDelivery?.delivery) {
    case "sent":
      return { label: "enviado", icon: Check, className: "text-muted-foreground" };
    case "delivered":
      return { label: "entregue", icon: CheckCheck, className: "text-muted-foreground" };
    case "read":
      return { label: "lida", icon: CheckCheck, className: "text-primary" };
    case "failed":
      return { label: "falhou", icon: CircleAlert, className: "text-destructive" };
    default:
      return null;
  }
}

function ContactPanel({ conv }: { conv: ConvRow }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const canEdit = isAdminOrManager(session.roles);
  const c = conv.contacts;
  const [name, setName] = useState(c?.name ?? "");
  const [phone, setPhone] = useState(c?.phone ?? "");
  const [email, setEmail] = useState(c?.email ?? "");
  const [note, setNote] = useState("");

  useEffect(() => {
    setName(c?.name ?? "");
    setPhone(c?.phone ?? "");
    setEmail(c?.email ?? "");
  }, [c?.id]);

  const { data: notes = [] } = useQuery({
    queryKey: ["contact_notes", c?.id],
    queryFn: async () => {
      if (!c?.id) return [];
      const { data } = await supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", c.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!c?.id,
  });

  async function saveContact() {
    if (!c) return;
    const { error } = await supabase.from("contacts").update({ name, phone, email }).eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Contato atualizado");
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }

  async function addNote() {
    if (!note.trim() || !c?.id || !session.profile?.tenant_id || !session.user) return;
    const { error } = await supabase.from("contact_notes").insert({
      tenant_id: session.profile.tenant_id,
      contact_id: c.id,
      author_id: session.user.id,
      content: note,
    });
    if (error) return toast.error(error.message);
    setNote("");
    queryClient.invalidateQueries({ queryKey: ["contact_notes", c.id] });
    toast.success("Nota adicionada");
  }

  if (!c) return null;
  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-l bg-background">
      <div className="border-b p-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
          {c.name
            .split(" ")
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </div>
        <p className="mt-3 text-base font-semibold">{c.name}</p>
        <p className="text-xs text-muted-foreground">{conv.inboxes?.name}</p>
      </div>
      <div className="space-y-4 p-5">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Nome</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} className="mt-1" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Telefone</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canEdit} className="mt-1" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">E-mail</label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canEdit} className="mt-1" />
        </div>
        {canEdit && (
          <Button size="sm" onClick={saveContact} className="w-full">
            Salvar
          </Button>
        )}
        {!canEdit && (
          <p className="text-xs text-muted-foreground">
            Somente admin/gerente podem editar dados do contato.
          </p>
        )}
      </div>
      <div className="border-t p-5">
        <p className="mb-3 text-sm font-semibold">Notas internas</p>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Adicionar nota…"
          className="min-h-[60px]"
        />
        <Button size="sm" onClick={addNote} disabled={!note.trim()} className="mt-2 w-full" variant="outline">
          Adicionar nota
        </Button>
        <div className="mt-4 space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded-md bg-chat-private p-2 text-xs text-chat-private-foreground">
              <p>{n.content}</p>
              <p className="mt-1 text-[10px] opacity-70">
                {new Date(n.created_at).toLocaleString("pt-BR")}
              </p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
