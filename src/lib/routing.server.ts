import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ChannelType } from "./inbox-connections";
import {
  pickAgentForAssignment,
  pickRoutingRule,
  shouldRedistributeOnAvailabilityChange,
  type AgentRoutingCandidate,
  type RoutingRuleDecision,
} from "./routing";

type AssignmentResult = {
  teamId: string | null;
  assigneeId: string | null;
  ruleId: string | null;
};

type TeamMemberProfile = {
  id: string;
  availability: string;
};

type ConversationForRouting = {
  id: string;
  tenant_id: string;
  inbox_id: string;
  team_id: string | null;
  assignee_id: string | null;
  status: string;
  inboxes: {
    channel_type: ChannelType;
  } | null;
};

type AgentPreferenceRow = {
  user_id: string;
  auto_assign: boolean;
  allowed_channels: ChannelType[];
  allowed_inbox_ids: string[];
  max_open_conversations: number;
  last_assigned_at: string | null;
};

type AvailabilityStatus = "online" | "busy" | "offline";

export async function autoAssignConversation(params: {
  conversationId: string;
  tenantId: string;
  inboxId: string;
  channel: ChannelType;
  currentTeamId?: string | null;
  currentAssigneeId?: string | null;
}) {
  if (params.currentAssigneeId) {
    return {
      teamId: params.currentTeamId ?? null,
      assigneeId: params.currentAssigneeId,
      ruleId: null,
    } satisfies AssignmentResult;
  }

  const rules = await getRoutingRules(params.tenantId);
  const selectedRule = pickRoutingRule(rules, {
    channel: params.channel,
    inboxId: params.inboxId,
  });

  if (!selectedRule) {
    return {
      teamId: params.currentTeamId ?? null,
      assigneeId: null,
      ruleId: null,
    } satisfies AssignmentResult;
  }

  const candidates = await getTeamCandidates(params.tenantId, selectedRule.teamId);
  const selectedAgent = pickAgentForAssignment(
    candidates,
    {
      channel: params.channel,
      inboxId: params.inboxId,
    },
    selectedRule.strategy,
  );

  const nextValues = {
    team_id: selectedRule.teamId,
    assignee_id: selectedAgent?.userId ?? null,
  };

  const { error } = await supabaseAdmin
    .from("conversations")
    .update(nextValues)
    .eq("id", params.conversationId)
    .eq("tenant_id", params.tenantId);

  if (error) throw error;

  if (selectedAgent) {
    await touchAgentAssignment(params.tenantId, selectedAgent);
  }

  return {
    teamId: selectedRule.teamId,
    assigneeId: selectedAgent?.userId ?? null,
    ruleId: selectedRule.id,
  } satisfies AssignmentResult;
}

export async function redistributeConversationForTenant(params: {
  conversationId: string;
  tenantId: string;
  force?: boolean;
}) {
  const conversation = await getConversationForRouting(params.conversationId, params.tenantId);
  if (!conversation || !conversation.inboxes) {
    return null;
  }

  const currentAvailability = conversation.assignee_id
    ? await getProfileAvailability(params.tenantId, conversation.assignee_id)
    : null;

  if (!params.force && conversation.assignee_id && currentAvailability === "online") {
    return {
      teamId: conversation.team_id,
      assigneeId: conversation.assignee_id,
      ruleId: null,
      changed: false,
    };
  }

  const rule = conversation.team_id
    ? await getTeamRoutingRule(params.tenantId, conversation.team_id, {
        channel: conversation.inboxes.channel_type,
        inboxId: conversation.inbox_id,
      })
    : null;

  const selectedRule =
    rule ??
    pickRoutingRule(await getRoutingRules(params.tenantId), {
      channel: conversation.inboxes.channel_type,
      inboxId: conversation.inbox_id,
    });

  if (!selectedRule) {
    if (conversation.team_id && conversation.assignee_id !== null) {
      await updateConversationAssignment({
        conversationId: conversation.id,
        tenantId: params.tenantId,
        teamId: conversation.team_id,
        assigneeId: null,
      });
      return {
        teamId: conversation.team_id,
        assigneeId: null,
        ruleId: null,
        changed: true,
      };
    }

    return {
      teamId: conversation.team_id,
      assigneeId: conversation.assignee_id,
      ruleId: null,
      changed: false,
    };
  }

  const candidates = await getTeamCandidates(params.tenantId, selectedRule.teamId);
  const selectedAgent = pickAgentForAssignment(
    candidates,
    {
      channel: conversation.inboxes.channel_type,
      inboxId: conversation.inbox_id,
    },
    selectedRule.strategy,
    {
      excludeUserIds: conversation.assignee_id ? [conversation.assignee_id] : [],
    },
  );

  const nextTeamId = selectedRule.teamId;
  const nextAssigneeId = selectedAgent?.userId ?? null;
  const changed =
    nextTeamId !== conversation.team_id || nextAssigneeId !== conversation.assignee_id;

  if (!changed) {
    return {
      teamId: conversation.team_id,
      assigneeId: conversation.assignee_id,
      ruleId: selectedRule.id,
      changed: false,
    };
  }

  await updateConversationAssignment({
    conversationId: conversation.id,
    tenantId: params.tenantId,
    teamId: nextTeamId,
    assigneeId: nextAssigneeId,
  });

  if (selectedAgent) {
    await touchAgentAssignment(params.tenantId, selectedAgent);
  }

  return {
    teamId: nextTeamId,
    assigneeId: nextAssigneeId,
    ruleId: selectedRule.id,
    changed: true,
  };
}

export async function updateAgentAvailabilityForTenant(params: {
  tenantId: string;
  userId: string;
  availability: AvailabilityStatus;
}) {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("availability")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.userId)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) return null;

  const previousAvailability = profile.availability;
  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ availability: params.availability })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.userId);

  if (updateError) throw updateError;

  let reassignedCount = 0;
  let touchedConversationCount = 0;

  if (shouldRedistributeOnAvailabilityChange(previousAvailability, params.availability)) {
    const { data: conversations, error: conversationsError } = await supabaseAdmin
      .from("conversations")
      .select("id")
      .eq("tenant_id", params.tenantId)
      .eq("assignee_id", params.userId)
      .in("status", ["open", "pending"]);

    if (conversationsError) throw conversationsError;

    touchedConversationCount = conversations?.length ?? 0;

    for (const conversation of conversations ?? []) {
      const result = await redistributeConversationForTenant({
        conversationId: conversation.id,
        tenantId: params.tenantId,
        force: true,
      });

      if (result?.changed) {
        reassignedCount += 1;
      }
    }
  }

  return {
    previousAvailability,
    availability: params.availability,
    changed: previousAvailability !== params.availability,
    touchedConversationCount,
    reassignedCount,
  };
}

async function getRoutingRules(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("routing_rules")
    .select("id, team_id, strategy, priority, channel_types, inbox_ids, is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (error) throw error;

  return ((data ?? []) as Array<{
    id: string;
    team_id: string;
    strategy: "round_robin" | "least_loaded";
    priority: number;
    channel_types: ChannelType[] | null;
    inbox_ids: string[] | null;
    is_active: boolean;
  }>).map((rule) => ({
    id: rule.id,
    teamId: rule.team_id,
    strategy: rule.strategy,
    priority: rule.priority,
    channelTypes: rule.channel_types ?? [],
    inboxIds: rule.inbox_ids ?? [],
    isActive: rule.is_active,
  })) satisfies RoutingRuleDecision[];
}

async function getTeamRoutingRule(
  tenantId: string,
  teamId: string,
  input: { channel: ChannelType; inboxId: string },
) {
  const allRules = await getRoutingRules(tenantId);
  const teamRules = allRules.filter((rule) => rule.teamId === teamId);
  return pickRoutingRule(teamRules, input);
}

async function getConversationForRouting(conversationId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .select("id, tenant_id, inbox_id, team_id, assignee_id, status, inboxes(channel_type)")
    .eq("id", conversationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return data as unknown as ConversationForRouting;
}

async function getProfileAvailability(tenantId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("availability")
    .eq("tenant_id", tenantId)
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.availability ?? null;
}

async function updateConversationAssignment(params: {
  conversationId: string;
  tenantId: string;
  teamId: string | null;
  assigneeId: string | null;
}) {
  const { error } = await supabaseAdmin
    .from("conversations")
    .update({
      team_id: params.teamId,
      assignee_id: params.assigneeId,
    })
    .eq("id", params.conversationId)
    .eq("tenant_id", params.tenantId);

  if (error) throw error;
}

async function touchAgentAssignment(tenantId: string, agent: AgentRoutingCandidate) {
  const { error } = await supabaseAdmin
    .from("agent_routing_preferences")
    .upsert({
      user_id: agent.userId,
      tenant_id: tenantId,
      auto_assign: agent.autoAssign,
      allowed_channels: agent.allowedChannels,
      allowed_inbox_ids: agent.allowedInboxIds,
      max_open_conversations: agent.maxOpenConversations,
      last_assigned_at: new Date().toISOString(),
    });

  if (error) throw error;
}

async function getTeamCandidates(tenantId: string, teamId: string) {
  const { data: members, error: memberError } = await supabaseAdmin
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId);

  if (memberError) throw memberError;

  const userIds = (members ?? []).map((member) => member.user_id);
  if (userIds.length === 0) return [];

  const [profilesResult, prefsResult, openConversationsResult] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, availability")
      .eq("tenant_id", tenantId)
      .in("id", userIds),
    supabaseAdmin
      .from("agent_routing_preferences")
      .select(
        "user_id, auto_assign, allowed_channels, allowed_inbox_ids, max_open_conversations, last_assigned_at",
      )
      .eq("tenant_id", tenantId)
      .in("user_id", userIds),
    supabaseAdmin
      .from("conversations")
      .select("assignee_id, status")
      .eq("tenant_id", tenantId)
      .in("assignee_id", userIds)
      .in("status", ["open", "pending"]),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (prefsResult.error) throw prefsResult.error;
  if (openConversationsResult.error) throw openConversationsResult.error;

  const profiles = (profilesResult.data ?? []) as TeamMemberProfile[];
  const prefs = (prefsResult.data ?? []) as AgentPreferenceRow[];
  const openCounts = new Map<string, number>();

  for (const conversation of openConversationsResult.data ?? []) {
    if (!conversation.assignee_id) continue;
    openCounts.set(
      conversation.assignee_id,
      (openCounts.get(conversation.assignee_id) ?? 0) + 1,
    );
  }

  return profiles.map((profile) => {
    const pref = prefs.find((item) => item.user_id === profile.id);
    return {
      userId: profile.id,
      availability: profile.availability,
      autoAssign: pref?.auto_assign ?? true,
      allowedChannels: pref?.allowed_channels ?? [],
      allowedInboxIds: pref?.allowed_inbox_ids ?? [],
      maxOpenConversations: pref?.max_open_conversations ?? 10,
      openConversationCount: openCounts.get(profile.id) ?? 0,
      lastAssignedAt: pref?.last_assigned_at ?? null,
    } satisfies AgentRoutingCandidate;
  });
}
