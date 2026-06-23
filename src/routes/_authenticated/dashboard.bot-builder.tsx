import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { MessageSquare, HelpCircle, GitBranch, Zap, Play, Save, Send, Bot } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useSession, isAdmin, hasRole } from "@/lib/auth";

import { RoleGuard } from "@/lib/role-guard";

export const Route = createFileRoute("/_authenticated/dashboard/bot-builder")({
  head: () => ({ meta: [{ title: "Construtor de bot — FlowChat" }] }),
  component: () => (
    <RoleGuard allow={["admin", "gerente"]}>
      <ReactFlowProvider>
        <BotBuilderPage />
      </ReactFlowProvider>
    </RoleGuard>
  ),
});

const blockTypes = [
  { type: "message", label: "Mensagem", icon: MessageSquare, desc: "Envia uma mensagem" },
  { type: "question", label: "Pergunta", icon: HelpCircle, desc: "Espera resposta" },
  { type: "condition", label: "Condição", icon: GitBranch, desc: "Se/senão" },
  { type: "action", label: "Ação", icon: Zap, desc: "Transferir / resolver" },
];

const initialNodes: Node[] = [
  {
    id: "1",
    type: "default",
    position: { x: 200, y: 80 },
    data: { label: "👋 Boas-vindas", content: "Olá! Bem-vindo. Como posso te ajudar?" },
  },
  {
    id: "2",
    type: "default",
    position: { x: 200, y: 240 },
    data: { label: "❓ Menu", content: "1) Preços\n2) Horário\n3) Falar com humano" },
  },
];
const initialEdges: Edge[] = [{ id: "e1-2", source: "1", target: "2" }];

function BotBuilderPage() {
  const session = useSession();
  const navigate = useNavigate();
  const canEdit = isAdmin(session.roles);
  const canRead = canEdit || hasRole(session.roles, "gerente");

  useEffect(() => {
    if (!session.loading && !canRead) {
      toast.error("Permissão negada");
      navigate({ to: "/dashboard" });
    }
  }, [session.loading, canRead, navigate]);

  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [selected, setSelected] = useState<Node | null>(null);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState("Fluxo principal");
  const [testOpen, setTestOpen] = useState(false);

  // Load latest flow
  useEffect(() => {
    if (!session.profile?.tenant_id) return;
    supabase
      .from("bot_flows")
      .select("*")
      .eq("tenant_id", session.profile.tenant_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setFlowId(data.id);
          setFlowName(data.name);
          if (Array.isArray(data.nodes) && data.nodes.length) setNodes(data.nodes as unknown as Node[]);
          if (Array.isArray(data.edges) && data.edges.length) setEdges(data.edges as unknown as Edge[]);
        }
      });
  }, [session.profile?.tenant_id]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => canEdit && setNodes((nds) => applyNodeChanges(changes, nds)),
    [canEdit],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => canEdit && setEdges((eds) => applyEdgeChanges(changes, eds)),
    [canEdit],
  );
  const onConnect = useCallback(
    (c: Connection) => canEdit && setEdges((eds) => addEdge(c, eds)),
    [canEdit],
  );

  function addBlock(type: string) {
    if (!canEdit) return;
    const id = `n-${Date.now()}`;
    const label = blockTypes.find((b) => b.type === type)?.label ?? "Bloco";
    setNodes((n) => [
      ...n,
      {
        id,
        type: "default",
        position: { x: 300 + Math.random() * 100, y: 300 + Math.random() * 100 },
        data: { label, content: "Editar conteúdo", blockType: type },
      },
    ]);
  }

  async function save(publish = false) {
    if (!session.profile?.tenant_id) return;
    const payload = {
      tenant_id: session.profile.tenant_id,
      name: flowName,
      status: (publish ? "published" : "draft") as "published" | "draft",
      nodes: nodes as unknown as never,
      edges: edges as unknown as never,
      updated_by: session.user!.id,
    };
    let res;
    if (flowId) {
      res = await supabase.from("bot_flows").update(payload).eq("id", flowId).select("id").single();
    } else {
      res = await supabase.from("bot_flows").insert(payload).select("id").single();
    }
    if (res.error) return toast.error(res.error.message);
    if (res.data) setFlowId(res.data.id);
    toast.success(publish ? "Fluxo publicado!" : "Fluxo salvo");
  }

  function updateSelected(patch: Partial<Node["data"]>) {
    if (!selected || !canEdit) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === selected.id ? { ...n, data: { ...n.data, ...patch } } : n)),
    );
    setSelected({ ...selected, data: { ...selected.data, ...patch } });
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Block sidebar */}
      <aside className="w-64 shrink-0 border-r bg-secondary/30 p-3">
        <h2 className="mb-3 text-sm font-semibold">Blocos</h2>
        <div className="space-y-2">
          {blockTypes.map((b) => (
            <button
              key={b.type}
              onClick={() => addBlock(b.type)}
              disabled={!canEdit}
              className="flex w-full items-start gap-2 rounded-lg border bg-background p-3 text-left text-sm transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <b.icon className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <p className="font-medium">{b.label}</p>
                <p className="text-xs text-muted-foreground">{b.desc}</p>
              </div>
            </button>
          ))}
        </div>
        {!canEdit && (
          <p className="mt-4 rounded-md bg-warning/10 p-2 text-xs text-warning-foreground">
            Modo leitura. Somente admin pode editar.
          </p>
        )}
      </aside>

      {/* Canvas */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-background px-4 py-2">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <Input
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              disabled={!canEdit}
              className="h-8 w-64 text-sm font-medium"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setTestOpen((v) => !v)} className="gap-1.5">
              <Play className="h-3.5 w-3.5" /> Testar
            </Button>
            {canEdit && (
              <>
                <Button variant="outline" size="sm" onClick={() => save(false)} className="gap-1.5">
                  <Save className="h-3.5 w-3.5" /> Salvar
                </Button>
                <Button size="sm" onClick={() => save(true)} className="gap-1.5">
                  Publicar
                </Button>
              </>
            )}
          </div>
        </header>
        <div className="relative min-h-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelected(n)}
            onPaneClick={() => setSelected(null)}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable
            fitView
          >
            <Background gap={16} />
            <Controls />
          </ReactFlow>
          {testOpen && <TestWidget nodes={nodes} onClose={() => setTestOpen(false)} />}
        </div>
      </div>

      {/* Properties */}
      <aside className="w-72 shrink-0 border-l bg-background p-4">
        <h2 className="mb-3 text-sm font-semibold">Propriedades</h2>
        {selected ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Título</Label>
              <Input
                value={(selected.data.label as string) ?? ""}
                onChange={(e) => updateSelected({ label: e.target.value })}
                disabled={!canEdit}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Conteúdo</Label>
              <Textarea
                value={(selected.data.content as string) ?? ""}
                onChange={(e) => updateSelected({ content: e.target.value })}
                disabled={!canEdit}
                className="mt-1"
                rows={6}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Selecione um bloco para editar.</p>
        )}
      </aside>
    </div>
  );
}

function TestWidget({ nodes, onClose }: { nodes: Node[]; onClose: () => void }) {
  type Msg = { from: "bot" | "user"; text: string };
  const [messages, setMessages] = useState<Msg[]>(() => {
    const first = nodes[0]?.data?.content;
    return first ? [{ from: "bot", text: String(first) }] : [];
  });
  const [text, setText] = useState("");
  const [step, setStep] = useState(0);

  function send() {
    if (!text.trim()) return;
    const next: Msg[] = [...messages, { from: "user", text }];
    const nextStep = step + 1;
    const botNode = nodes[nextStep];
    if (botNode?.data?.content) {
      next.push({ from: "bot", text: String(botNode.data.content) });
    } else {
      next.push({ from: "bot", text: "Obrigado! Vou te transferir a um humano." });
    }
    setMessages(next);
    setStep(nextStep);
    setText("");
  }

  return (
    <Card className="absolute bottom-4 right-4 z-20 w-80 shadow-xl">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-sm font-semibold">Preview do bot</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">×</button>
      </div>
      <CardContent className="p-3">
        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${
                m.from === "bot"
                  ? "self-start bg-secondary"
                  : "self-end bg-primary text-primary-foreground"
              }`}
            >
              {m.text}
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Digite…"
            className="h-8"
          />
          <Button size="icon" onClick={send} className="h-8 w-8">
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
