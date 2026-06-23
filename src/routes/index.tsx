import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  MessageSquare,
  Instagram,
  Facebook,
  Send,
  Globe,
  Phone,
  Zap,
  Clock,
  TrendingUp,
  Check,
  Sparkles,
  Bot,
  Users,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FlowChat — Atenda seus clientes 24/7 em todos os canais" },
      {
        name: "description",
        content:
          "WhatsApp, Instagram, Facebook, Webchat e Telegram unificados. IA + atendimento humano em equipe.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <Hero />
      <ProblemSection />
      <DemoSection />
      <ChannelsSection />
      <RoiCalculator />
      <PricingSection />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <MessageSquare className="h-5 w-5" />
          </div>
          <span className="text-lg">FlowChat</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
          <a href="#funcionalidades" className="hover:text-foreground">Funcionalidades</a>
          <a href="#canais" className="hover:text-foreground">Canais</a>
          <a href="#precos" className="hover:text-foreground">Preços</a>
          <a href="#roi" className="hover:text-foreground">ROI</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost" size="sm">Entrar</Button>
          </Link>
          <Link to="/signup">
            <Button size="sm">Criar minha conta</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-background to-background" />
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
        <div className="flex flex-col justify-center">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Plataforma omnichannel com IA
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Atenda seus clientes <span className="text-primary">24/7</span> onde quer que eles estejam
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Unifique WhatsApp, Instagram, Facebook e Webchat em um só lugar com IA que vende, qualifica
            e transfere para a equipe certa.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/signup">
              <Button size="lg" className="gap-2">
                Começar grátis <Zap className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#roi">
              <Button size="lg" variant="outline">Calcular meu ROI</Button>
            </a>
          </div>
          <div className="mt-8 flex items-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> 14 dias grátis</span>
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> Sem cartão</span>
          </div>
        </div>
        <div className="flex items-center justify-center">
          <LiveChatPreview />
        </div>
      </div>
    </section>
  );
}

function LiveChatPreview() {
  const script = useMemo(
    () => [
      { from: "bot", text: "Olá! 👋 Bem-vindo à FlowChat. Como posso te ajudar?" },
      { from: "user", text: "Qual o preço?" },
      { from: "bot", text: "Temos planos a partir de R$67/mês. Quer ver a comparação?" },
      { from: "user", text: "Sim, manda!" },
      { from: "bot", text: "Perfeito! Vou te conectar com um especialista 🚀" },
    ],
    [],
  );
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setVisible((v) => (v + 1 > script.length ? 1 : v + 1));
    }, 1800);
    return () => clearInterval(id);
  }, [script.length]);

  return (
    <div className="w-full max-w-sm rounded-2xl border bg-card shadow-2xl shadow-primary/10">
      <div className="flex items-center justify-between rounded-t-2xl bg-primary px-4 py-3 text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/15">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">FlowBot</p>
            <p className="flex items-center gap-1.5 text-xs opacity-80">
              <span className="inline-block h-2 w-2 rounded-full bg-success" /> Online
            </p>
          </div>
        </div>
      </div>
      <div className="flex h-80 flex-col gap-2 overflow-y-auto p-4">
        {script.slice(0, visible).map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
              m.from === "bot"
                ? "self-start bg-secondary text-secondary-foreground rounded-bl-sm"
                : "self-end bg-primary text-primary-foreground rounded-br-sm"
            }`}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t p-3">
        <Input placeholder="Digite uma mensagem…" className="border-0 shadow-none focus-visible:ring-0" />
        <Button size="icon" className="h-9 w-9 shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ProblemSection() {
  const items = [
    {
      icon: Clock,
      stat: "67%",
      title: "abandonam ao esperar +2 min",
      desc: "Clientes não toleram filas longas. Cada minuto vira venda perdida.",
    },
    {
      icon: TrendingUp,
      stat: "R$ 50k/mês",
      title: "perdidos sem atendimento noturno",
      desc: "Empresas médias perdem leads por não responder fora do expediente.",
    },
    {
      icon: Users,
      stat: "73%",
      title: "comprariam com resposta imediata",
      desc: "Velocidade é o novo diferencial competitivo no atendimento.",
    },
  ];
  return (
    <section id="funcionalidades" className="border-t bg-secondary/40 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Por que unificar seus canais?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Os números mostram: atendimento lento e fragmentado custa caro.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {items.map((it) => (
            <Card key={it.title} className="border-border/60">
              <CardHeader>
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <it.icon className="h-5 w-5" />
                </div>
                <CardTitle className="mt-4 text-3xl font-bold text-primary">{it.stat}</CardTitle>
                <CardDescription className="text-base font-medium text-foreground">
                  {it.title}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{it.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoSection() {
  return (
    <section className="py-20">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Uma caixa de entrada para todos os canais
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Igual ao Chatwoot: lista de conversas no centro, contato à direita, atalhos para responder
            rápido. Bot resolve o simples, humano fecha a venda.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              { icon: Inbox, title: "Caixa unificada", desc: "Todos os canais, uma única interface." },
              { icon: Bot, title: "Bot inteligente", desc: "Atendimento 24/7 com fluxo customizado." },
              { icon: Users, title: "Roteamento por equipe", desc: "Vendas, suporte, financeiro." },
            ].map((f) => (
              <li key={f.title} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">{f.title}</p>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border bg-card p-2 shadow-xl">
          <div className="rounded-xl bg-gradient-to-br from-primary/5 to-secondary p-6">
            <div className="grid grid-cols-12 gap-3 text-xs">
              <div className="col-span-1 flex flex-col items-center gap-2 rounded-lg bg-nav p-3 text-nav-foreground">
                <Inbox className="h-4 w-4" />
                <Users className="h-4 w-4 opacity-50" />
                <Bot className="h-4 w-4 opacity-50" />
              </div>
              <div className="col-span-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg border bg-background p-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-primary/20" />
                      <div className="flex-1">
                        <div className="h-2 w-20 rounded bg-foreground/20" />
                        <div className="mt-1 h-1.5 w-28 rounded bg-foreground/10" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="col-span-5 rounded-lg border bg-background p-3">
                <div className="space-y-2">
                  <div className="max-w-[70%] rounded-lg bg-secondary p-2">
                    <div className="h-1.5 w-24 rounded bg-foreground/20" />
                  </div>
                  <div className="ml-auto max-w-[70%] rounded-lg bg-primary p-2">
                    <div className="h-1.5 w-20 rounded bg-primary-foreground/40" />
                  </div>
                  <div className="max-w-[70%] rounded-lg bg-secondary p-2">
                    <div className="h-1.5 w-28 rounded bg-foreground/20" />
                  </div>
                </div>
              </div>
              <div className="col-span-2 rounded-lg border bg-background p-3">
                <div className="mx-auto h-10 w-10 rounded-full bg-primary/20" />
                <div className="mt-2 h-1.5 rounded bg-foreground/20" />
                <div className="mt-1 h-1.5 w-3/4 rounded bg-foreground/10" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ChannelsSection() {
  const channels = [
    { name: "WhatsApp", icon: Phone, color: "text-success" },
    { name: "Instagram", icon: Instagram, color: "text-[oklch(0.62_0.22_15)]" },
    { name: "Facebook", icon: Facebook, color: "text-primary" },
    { name: "Webchat", icon: Globe, color: "text-foreground" },
    { name: "Telegram", icon: Send, color: "text-info" },
  ];
  return (
    <section id="canais" className="border-y bg-secondary/40 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Conecte todos com 1 clique
          </h2>
          <p className="mt-3 text-muted-foreground">Sem complicação. Sem código.</p>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          {channels.map((c) => (
            <div
              key={c.name}
              className="flex flex-col items-center gap-3 rounded-xl border bg-card p-6 shadow-sm transition hover:shadow-md"
            >
              <c.icon className={`h-8 w-8 ${c.color}`} />
              <span className="text-sm font-medium">{c.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RoiCalculator() {
  const [atendimentos, setAtendimentos] = useState(1000);
  const [foraExpediente, setForaExpediente] = useState(35);
  const [ticket, setTicket] = useState(250);

  const perdaAtual = Math.round(atendimentos * (foraExpediente / 100) * 0.67);
  const conversoesExtras = Math.round(perdaAtual * 0.4);
  const recuperado = conversoesExtras * ticket;

  return (
    <section id="roi" className="py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Quanto você pode recuperar por mês?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Calcule a receita perdida com filas e horários sem atendimento.
          </p>
        </div>
        <Card className="mt-10 border-primary/20 shadow-lg shadow-primary/5">
          <CardContent className="grid gap-8 p-6 sm:p-8 md:grid-cols-2">
            <div className="space-y-6">
              <div>
                <label className="flex justify-between text-sm font-medium">
                  <span>Atendimentos por mês</span>
                  <span className="text-primary">{atendimentos.toLocaleString("pt-BR")}</span>
                </label>
                <Slider
                  value={[atendimentos]}
                  onValueChange={(v) => setAtendimentos(v[0])}
                  min={100}
                  max={10000}
                  step={100}
                  className="mt-3"
                />
              </div>
              <div>
                <label className="flex justify-between text-sm font-medium">
                  <span>% fora do horário comercial</span>
                  <span className="text-primary">{foraExpediente}%</span>
                </label>
                <Slider
                  value={[foraExpediente]}
                  onValueChange={(v) => setForaExpediente(v[0])}
                  min={0}
                  max={80}
                  step={5}
                  className="mt-3"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Ticket médio (R$)</label>
                <Input
                  type="number"
                  value={ticket}
                  onChange={(e) => setTicket(Number(e.target.value) || 0)}
                  className="mt-2"
                />
              </div>
            </div>
            <div className="flex flex-col justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 p-8 text-primary-foreground">
              <p className="text-sm opacity-90">Você pode recuperar até</p>
              <p className="mt-2 text-4xl font-bold sm:text-5xl">
                R$ {recuperado.toLocaleString("pt-BR")}
              </p>
              <p className="mt-1 text-sm opacity-90">por mês</p>
              <div className="mt-6 border-t border-primary-foreground/20 pt-4 text-sm opacity-90">
                <p>~ {conversoesExtras} vendas adicionais</p>
                <p>~ {perdaAtual} leads perdidos hoje</p>
              </div>
              <Link to="/signup" className="mt-6">
                <Button variant="secondary" className="w-full">Quero começar agora</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function PricingSection() {
  const plans = [
    {
      name: "Starter",
      price: 67,
      desc: "Para times pequenos começando",
      features: ["500 conversas/mês", "1 canal", "Bot básico", "3 agentes"],
    },
    {
      name: "Business",
      price: 147,
      desc: "Mais usado por PMEs",
      features: ["2.000 conversas/mês", "3 canais", "IA avançada (GPT)", "6 agentes"],
      highlight: true,
    },
    {
      name: "Enterprise",
      price: 297,
      desc: "Para times de alto volume",
      features: ["Conversas ilimitadas", "Todos os canais", "Bot + Humano", "25 agentes"],
    },
  ];
  return (
    <section id="precos" className="border-t bg-secondary/40 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Preços simples e diretos</h2>
          <p className="mt-3 text-muted-foreground">Comece grátis. Cancele quando quiser.</p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {plans.map((p) => (
            <Card
              key={p.name}
              className={p.highlight ? "border-primary shadow-xl shadow-primary/10 ring-2 ring-primary" : ""}
            >
              <CardHeader>
                {p.highlight && (
                  <span className="mb-2 w-fit rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    Mais popular
                  </span>
                )}
                <CardTitle className="text-2xl">{p.name}</CardTitle>
                <CardDescription>{p.desc}</CardDescription>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">R$ {p.price}</span>
                  <span className="text-sm text-muted-foreground">/mês</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {p.features.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-success" /> {f}
                  </div>
                ))}
                <Link to="/signup" className="block pt-3">
                  <Button className="w-full" variant={p.highlight ? "default" : "outline"}>
                    Começar grátis
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2 font-semibold">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <MessageSquare className="h-4 w-4" />
          </div>
          FlowChat Omnichannel
        </div>
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} FlowChat. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
