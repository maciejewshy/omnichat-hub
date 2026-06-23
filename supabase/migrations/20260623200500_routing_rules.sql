-- ============ ROUTING RULES ============
CREATE TABLE public.routing_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  strategy TEXT NOT NULL DEFAULT 'round_robin' CHECK (strategy IN ('round_robin', 'least_loaded')),
  channel_types public.channel_type[] NOT NULL DEFAULT ARRAY[]::public.channel_type[],
  inbox_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_routing_rules_tenant ON public.routing_rules(tenant_id);
CREATE INDEX idx_routing_rules_team ON public.routing_rules(team_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.routing_rules TO authenticated;
GRANT ALL ON public.routing_rules TO service_role;
ALTER TABLE public.routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view routing rules" ON public.routing_rules FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Admin/manager manage routing rules" ON public.routing_rules FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin_or_manager(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin_or_manager(auth.uid()));

-- ============ AGENT ROUTING PREFERENCES ============
CREATE TABLE public.agent_routing_preferences (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  auto_assign BOOLEAN NOT NULL DEFAULT true,
  allowed_channels public.channel_type[] NOT NULL DEFAULT ARRAY[]::public.channel_type[],
  allowed_inbox_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  max_open_conversations INTEGER NOT NULL DEFAULT 10,
  last_assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_routing_preferences_tenant ON public.agent_routing_preferences(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_routing_preferences TO authenticated;
GRANT ALL ON public.agent_routing_preferences TO service_role;
ALTER TABLE public.agent_routing_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view routing preferences" ON public.agent_routing_preferences FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Admin/manager manage routing preferences" ON public.agent_routing_preferences FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin_or_manager(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.is_admin_or_manager(auth.uid()));

CREATE TRIGGER trg_routing_rules_updated BEFORE UPDATE ON public.routing_rules
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_agent_routing_preferences_updated BEFORE UPDATE ON public.agent_routing_preferences
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
