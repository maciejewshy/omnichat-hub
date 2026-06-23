
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('superadmin', 'admin', 'gerente', 'agente');
CREATE TYPE public.tenant_plan AS ENUM ('starter', 'business', 'enterprise');
CREATE TYPE public.tenant_status AS ENUM ('trial', 'active', 'suspended');
CREATE TYPE public.channel_type AS ENUM ('whatsapp', 'instagram', 'facebook', 'webchat', 'telegram');
CREATE TYPE public.conversation_status AS ENUM ('open', 'pending', 'resolved', 'snoozed');
CREATE TYPE public.message_sender_type AS ENUM ('contact', 'agent', 'bot', 'system');
CREATE TYPE public.availability_status AS ENUM ('online', 'busy', 'offline');
CREATE TYPE public.bot_flow_status AS ENUM ('draft', 'published');

-- ============ TENANTS ============
CREATE TABLE public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  plan public.tenant_plan NOT NULL DEFAULT 'starter',
  status public.tenant_status NOT NULL DEFAULT 'trial',
  max_agents INTEGER NOT NULL DEFAULT 3,
  max_conversations INTEGER NOT NULL DEFAULT 500,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  availability public.availability_status NOT NULL DEFAULT 'offline',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_tenant ON public.profiles(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, role)
);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_user_tenant(_user_id UUID)
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'gerente')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
$$;

-- ============ POLICIES: tenants ============
CREATE POLICY "Tenant members can view own tenant" ON public.tenants FOR SELECT TO authenticated
  USING (id = public.get_user_tenant(auth.uid()) OR public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmin manages tenants" ON public.tenants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin')) WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Admin updates own tenant" ON public.tenants FOR UPDATE TO authenticated
  USING (id = public.get_user_tenant(auth.uid()) AND public.is_admin(auth.uid()))
  WITH CHECK (id = public.get_user_tenant(auth.uid()) AND public.is_admin(auth.uid()));

-- ============ POLICIES: profiles ============
CREATE POLICY "View profiles in own tenant" ON public.profiles FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) OR public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Admin manages profiles in tenant" ON public.profiles FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin(auth.uid()));

-- ============ POLICIES: user_roles ============
CREATE POLICY "View roles in own tenant" ON public.user_roles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR tenant_id = public.get_user_tenant(auth.uid())
    OR public.has_role(auth.uid(), 'superadmin')
  );

-- ============ TEAMS ============
CREATE TABLE public.teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_teams_tenant ON public.teams(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members view teams" ON public.teams FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "Admin/manager manage teams" ON public.teams FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin_or_manager(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin_or_manager(auth.uid()));

CREATE TABLE public.team_members (
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members view team members" ON public.team_members FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.tenant_id = public.get_user_tenant(auth.uid())));
CREATE POLICY "Admin/manager manage team members" ON public.team_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.tenant_id = public.get_user_tenant(auth.uid())) AND public.is_admin_or_manager(auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.tenant_id = public.get_user_tenant(auth.uid())) AND public.is_admin_or_manager(auth.uid()));

-- ============ INBOXES ============
CREATE TABLE public.inboxes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel_type public.channel_type NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inboxes_tenant ON public.inboxes(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inboxes TO authenticated;
GRANT ALL ON public.inboxes TO service_role;
ALTER TABLE public.inboxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members view inboxes" ON public.inboxes FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "Admin manages inboxes" ON public.inboxes FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin(auth.uid()));

CREATE TABLE public.inbox_members (
  inbox_id UUID NOT NULL REFERENCES public.inboxes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (inbox_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_members TO authenticated;
GRANT ALL ON public.inbox_members TO service_role;
ALTER TABLE public.inbox_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members view inbox members" ON public.inbox_members FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inboxes i WHERE i.id = inbox_id AND i.tenant_id = public.get_user_tenant(auth.uid())));
CREATE POLICY "Admin manages inbox members" ON public.inbox_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inboxes i WHERE i.id = inbox_id AND i.tenant_id = public.get_user_tenant(auth.uid())) AND public.is_admin(auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inboxes i WHERE i.id = inbox_id AND i.tenant_id = public.get_user_tenant(auth.uid())) AND public.is_admin(auth.uid()));

-- ============ LABELS ============
CREATE TABLE public.labels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#2563eb',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_labels_tenant ON public.labels(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.labels TO authenticated;
GRANT ALL ON public.labels TO service_role;
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members view labels" ON public.labels FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "Admin/manager manage labels" ON public.labels FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin_or_manager(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin_or_manager(auth.uid()));

-- ============ CANNED RESPONSES ============
CREATE TABLE public.canned_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  short_code TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, short_code)
);
CREATE INDEX idx_canned_tenant ON public.canned_responses(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.canned_responses TO authenticated;
GRANT ALL ON public.canned_responses TO service_role;
ALTER TABLE public.canned_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members view canned" ON public.canned_responses FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "Admin/manager manage canned" ON public.canned_responses FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin_or_manager(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin_or_manager(auth.uid()));

-- ============ CONTACTS ============
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  avatar_url TEXT,
  identifier TEXT,
  custom_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contacts_tenant ON public.contacts(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members view contacts" ON public.contacts FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "Tenant members create contacts" ON public.contacts FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "Admin/manager update contacts" ON public.contacts FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin_or_manager(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Admin delete contacts" ON public.contacts FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin(auth.uid()));

-- ============ CONTACT NOTES ============
CREATE TABLE public.contact_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contact_notes_contact ON public.contact_notes(contact_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_notes TO authenticated;
GRANT ALL ON public.contact_notes TO service_role;
ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members view notes" ON public.contact_notes FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "Tenant members add notes" ON public.contact_notes FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND author_id = auth.uid());
CREATE POLICY "Author or admin delete note" ON public.contact_notes FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND (author_id = auth.uid() OR public.is_admin(auth.uid())));

-- ============ CONVERSATIONS ============
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  inbox_id UUID NOT NULL REFERENCES public.inboxes(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status public.conversation_status NOT NULL DEFAULT 'open',
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  priority TEXT,
  labels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conv_tenant ON public.conversations(tenant_id);
CREATE INDEX idx_conv_assignee ON public.conversations(assignee_id);
CREATE INDEX idx_conv_status ON public.conversations(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin/manager view all conversations" ON public.conversations FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Agents view assigned and unassigned" ON public.conversations FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (assignee_id = auth.uid() OR assignee_id IS NULL)
  );
CREATE POLICY "Tenant members create conversations" ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "Tenant members update conversations" ON public.conversations FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.is_admin_or_manager(auth.uid()) OR assignee_id = auth.uid() OR assignee_id IS NULL)
  )
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()));

-- ============ MESSAGES ============
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_type public.message_sender_type NOT NULL,
  sender_id UUID,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX idx_messages_tenant ON public.messages(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View messages of accessible conversations" ON public.messages FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.conversations c WHERE c.id = conversation_id
      AND (public.is_admin_or_manager(auth.uid()) OR c.assignee_id = auth.uid() OR c.assignee_id IS NULL)
    )
  );
CREATE POLICY "Tenant members insert messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()));

-- ============ BOT FLOWS ============
CREATE TABLE public.bot_flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  inbox_id UUID REFERENCES public.inboxes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status public.bot_flow_status NOT NULL DEFAULT 'draft',
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bot_flows_tenant ON public.bot_flows(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_flows TO authenticated;
GRANT ALL ON public.bot_flows TO service_role;
ALTER TABLE public.bot_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members view flows" ON public.bot_flows FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "Admin manages flows" ON public.bot_flows FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin(auth.uid()));

-- ============ UPDATED_AT TRIGGER ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_bot_flows_updated BEFORE UPDATE ON public.bot_flows FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ NEW USER -> TENANT + ADMIN ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_tenant_id UUID;
  company_name TEXT;
  full_name TEXT;
  default_inbox_id UUID;
BEGIN
  company_name := COALESCE(NEW.raw_user_meta_data->>'company_name', 'Minha Empresa');
  full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  INSERT INTO public.tenants (name, plan, status, max_agents, max_conversations)
  VALUES (company_name, 'starter', 'trial', 3, 500)
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, full_name, email, availability)
  VALUES (NEW.id, new_tenant_id, full_name, NEW.email, 'online');

  INSERT INTO public.user_roles (user_id, tenant_id, role) VALUES (NEW.id, new_tenant_id, 'admin');

  INSERT INTO public.inboxes (tenant_id, name, channel_type, config)
  VALUES (new_tenant_id, 'Webchat (exemplo)', 'webchat', '{"snippet": "auto"}'::jsonb)
  RETURNING id INTO default_inbox_id;

  INSERT INTO public.inbox_members (inbox_id, user_id) VALUES (default_inbox_id, NEW.id);

  INSERT INTO public.canned_responses (tenant_id, short_code, content) VALUES
    (new_tenant_id, 'ola', 'Olá! Tudo bem? Como posso te ajudar hoje?'),
    (new_tenant_id, 'obrigado', 'Obrigado pelo contato! Estamos à disposição.'),
    (new_tenant_id, 'aguarde', 'Só um momento, estou consultando para você.');

  INSERT INTO public.labels (tenant_id, name, color) VALUES
    (new_tenant_id, 'Urgente', '#EF4444'),
    (new_tenant_id, 'Vendas', '#10B981'),
    (new_tenant_id, 'Suporte', '#2563EB');

  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
