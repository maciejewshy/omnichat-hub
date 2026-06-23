## FlowChat Omnichannel — MVP estilo Chatwoot

Painel inspirado no Chatwoot: layout de inbox unificado com lista de conversas no centro, painel de contato à direita, navegação principal por ícones à esquerda. Multi-tenant com RLS, roles e construtor de bot.

### Stack
- TanStack Start + React + Tailwind v4
- Lovable Cloud (Supabase) — auth e-mail/senha + RLS
- Azul `#2563eb` + branco, Inter, cards com sombra suave, radius 8px
- Layout Chatwoot: sidebar de ícones (~64px) + sidebar secundária (filtros/caixas) + área principal

---

### 1. Landing pública

- `/` — Home: header, hero com chat simulado, seção problema (3 cards), demo de chat, grid de canais, calculadora de ROI, preços (3 planos), footer.
- `/login` e `/signup` (signup cria tenant + ADMIN).

---

### 2. Modelo de dados (espelhando entidades Chatwoot)

Schema `public` com RLS + GRANTs:

- `tenants` (= "Account" no Chatwoot) — id, nome, plano, status, limites
- `profiles` — id, tenant_id, nome, email, avatar, disponibilidade (online/busy/offline)
- enum `app_role`: `superadmin | admin | gerente | agente`
- `user_roles` — separada (segurança)
- `teams` (= equipes/setores) — id, tenant_id, nome, descrição
- `team_members` — team_id, user_id
- `inboxes` (= caixas de entrada por canal) — id, tenant_id, nome, channel_type (whatsapp/instagram/facebook/webchat/telegram), config jsonb, status
- `inbox_members` — inbox_id, user_id (quem atende cada caixa)
- `contacts` — id, tenant_id, nome, telefone, email, avatar, identifier, custom_attributes
- `conversations` — id, tenant_id, inbox_id, contact_id, status (open/pending/resolved/snoozed), assignee_id, team_id, priority, labels, last_activity_at
- `messages` — id, conversation_id, tenant_id, sender_type (contact/agent/bot/system), sender_id, content, content_type (text/input_select/cards), attachments jsonb, private (notas internas), created_at
- `labels` — id, tenant_id, nome, cor
- `canned_responses` (= respostas rápidas /macros) — id, tenant_id, short_code, content
- `bot_flows` — id, tenant_id, inbox_id, nome, status, nodes jsonb, edges jsonb
- `notes` (= notas no contato) — id, contact_id, tenant_id, content, author_id

**Funções SECURITY DEFINER:**
- `has_role(_user_id, _role)`
- `get_user_tenant(_user_id)`
- Todas policies filtram `tenant_id = get_user_tenant(auth.uid())`

**Trigger:** signup → cria tenant + profile + role `admin` + inbox de exemplo (Webchat) + canned responses iniciais.

---

### 3. Layout do painel (Chatwoot-style)

```text
┌──┬─────────┬──────────────────────┬────────────┐
│N │ Filtros │ Lista de conversas / │ Painel     │
│av│ /Caixas │ Tela ativa           │ contexto   │
│64│ 280px   │ flex-1               │ 320px      │
└──┴─────────┴──────────────────────┴────────────┘
```

**Sidebar primária (ícones):** Conversas, Contatos, Relatórios, Campanhas (placeholder), Construtor (admin), Configurações.

**Sidebar secundária (muda conforme a seção):**
- Em Conversas: filtros (Atribuídas a mim, Não atribuídas, Todas, Menções), por status (Aberta/Pendente/Resolvida/Adiada), por Caixa, por Equipe, por Label.
- Em Contatos: Todos, Meus contatos, Segmentos.
- Em Configurações: Geral, Agentes, Equipes, Caixas, Labels, Respostas rápidas, Construtor de bot.

---

### 4. Tela de Conversas (`/dashboard/conversations`)

Três colunas:

1. **Lista de conversas** — cards com avatar, nome do contato, prévia da última mensagem, badge do canal, hora, indicador de não-lida, status (cor da borda).
2. **Painel da conversa** — header (nome, canal, ações: atribuir agente, atribuir equipe, label, mudar status, resolver), thread de mensagens com bolhas (contato à esquerda, agente à direita), separador de notas privadas (fundo amarelo claro), composer com:
   - Abas "Responder" / "Nota privada"
   - Anexos, emoji, respostas rápidas (`/atalho`), envio
   - Indicador de quem está digitando (visual placeholder)
3. **Painel de contexto do contato** — avatar, dados (telefone, e-mail, canal), atributos customizados, conversas anteriores, notas, labels.

**Roles:**
- Agente: vê só conversas atribuídas a ele + fila de não atribuídas (botão "Auto-atribuir").
- Gerente/Admin: vê tudo, pode atribuir/transferir.
- Edição de dados do contato bloqueada para agente (campos readonly, só adiciona notas).

---

### 5. Outras telas

- **`/dashboard/contacts`** — tabela paginada com busca, filtros, importar/exportar (UI), detalhe do contato com abas (Conversas, Notas, Atributos).
- **`/dashboard/reports`** — visão geral (conversas, CSAT, tempo médio de resposta, resolução), por agente, por caixa. Gráficos com Recharts.
- **`/dashboard/settings`** com sub-rotas:
  - `general` — dados do tenant
  - `agents` — admin convida/remove agentes, define role
  - `teams` — CRUD de equipes + membros
  - `inboxes` — lista de caixas + "Adicionar caixa" (wizard mockado por canal: WhatsApp QR placeholder, Webchat snippet JS, Meta OAuth placeholder, Telegram token)
  - `labels` — CRUD de labels
  - `canned-responses` — CRUD de respostas rápidas
- **`/dashboard/bot-builder`** — só admin. Canvas drag-and-drop com React Flow (`@xyflow/react`). Blocos: Mensagem, Pergunta, Condição, Ação (transferir/resolver/webhook). Sidebar de blocos + painel de propriedades. Botões "Testar" e "Publicar". Gerente: read-only. Agente: toast "Permissão negada" + redirect.

---

### 6. Painel `/superadmin`

- Lista de tenants (empresa, plano, status, qtd. agentes/conversas, ações).
- Criar tenant manualmente, editar limites, suspender/reativar.
- "Acessar como" (impersonate) — barra fixa no topo indicando modo impersonate + sair.

---

### 7. Server functions (TanStack `createServerFn` + `requireSupabaseAuth`)

Conversas: list, get, assignAgent, assignTeam, updateStatus, addLabel, sendMessage, sendPrivateNote.
Contatos: list, get, create, update, addNote.
Inboxes/Teams/Labels/CannedResponses: CRUD.
Bot: getFlow, saveFlow, publishFlow.
Reports: getOverview, getAgentMetrics.
Superadmin: listTenants, createTenant, updateLimits, impersonate (todas exigem role superadmin via `has_role`).

---

### 8. UX

- Toasts (sonner) em todas as ações.
- Estados de status com cores Chatwoot (Aberta=azul, Pendente=amarelo, Resolvida=verde, Adiada=cinza).
- Avatares com iniciais quando sem foto.
- Atalhos: `/` para respostas rápidas, `Cmd+Enter` envia.
- Onboarding após signup: checklist "Crie sua primeira caixa → Convide agentes → Configure bot".

---

### Fora do escopo desta entrega

- Integrações reais (WhatsApp Baileys/Meta, Instagram, Facebook, Telegram, Webchat embed em site externo).
- Realtime via WebSocket (usaremos refetch/polling com TanStack Query).
- Billing/pagamentos dos planos.
- Campanhas, automações avançadas, SLA, CSAT real.
- Importação CSV de contatos (UI presente, lógica mock).

Essas entram em iterações seguintes.

---

### Notas técnicas

- Lovable Cloud ativado no início.
- Layout `_authenticated/route.tsx` é gerenciado pela integração.
- React Flow (`@xyflow/react`) para builder.
- Superadmin provisionado via SQL manual (sem signup público).
