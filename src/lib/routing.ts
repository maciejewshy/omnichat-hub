import type { ChannelType } from "./inbox-connections";

export type RoutingRuleDecision = {
  id: string;
  teamId: string;
  strategy: "round_robin" | "least_loaded";
  priority: number;
  channelTypes: ChannelType[];
  inboxIds: string[];
  isActive: boolean;
};

export type AgentRoutingCandidate = {
  userId: string;
  availability: string;
  autoAssign: boolean;
  allowedChannels: ChannelType[];
  allowedInboxIds: string[];
  maxOpenConversations: number;
  openConversationCount: number;
  lastAssignedAt: string | null;
};

export type RoutingInput = {
  channel: ChannelType;
  inboxId: string;
};

export type AgentSelectionOptions = {
  excludeUserIds?: string[];
};

export function pickRoutingRule(
  rules: RoutingRuleDecision[],
  input: RoutingInput,
): RoutingRuleDecision | null {
  const matches = rules
    .filter((rule) => rule.isActive && ruleMatches(rule, input))
    .map((rule) => ({
      rule,
      score: getRuleScore(rule, input),
    }))
    .sort((a, b) => b.score - a.score || a.rule.priority - b.rule.priority);

  return matches[0]?.rule ?? null;
}

export function pickAgentForAssignment(
  candidates: AgentRoutingCandidate[],
  input: RoutingInput,
  strategy: "round_robin" | "least_loaded",
  options?: AgentSelectionOptions,
): AgentRoutingCandidate | null {
  const excluded = new Set(options?.excludeUserIds ?? []);
  const eligible = candidates.filter(
    (candidate) =>
      !excluded.has(candidate.userId) && candidateMatches(candidate, input),
  );
  if (eligible.length === 0) return null;

  const sorted = [...eligible].sort((a, b) => {
    const loadDiff = a.openConversationCount - b.openConversationCount;
    if (strategy === "least_loaded" && loadDiff !== 0) return loadDiff;

    const assignmentDiff = compareAssignmentTimestamp(a.lastAssignedAt, b.lastAssignedAt);
    if (assignmentDiff !== 0) return assignmentDiff;

    if (strategy === "round_robin" && loadDiff !== 0) return loadDiff;

    return a.userId.localeCompare(b.userId);
  });

  return sorted[0] ?? null;
}

export function shouldRedistributeOnAvailabilityChange(
  previousAvailability: string | null | undefined,
  nextAvailability: string,
) {
  return previousAvailability !== "offline" && nextAvailability === "offline";
}

function ruleMatches(rule: RoutingRuleDecision, input: RoutingInput) {
  const channelMatch =
    rule.channelTypes.length === 0 || rule.channelTypes.includes(input.channel);
  const inboxMatch = rule.inboxIds.length === 0 || rule.inboxIds.includes(input.inboxId);

  return channelMatch && inboxMatch;
}

function getRuleScore(rule: RoutingRuleDecision, input: RoutingInput) {
  let score = 0;

  if (rule.channelTypes.length === 0) score += 1;
  if (rule.channelTypes.includes(input.channel)) score += 10;

  if (rule.inboxIds.length === 0) score += 1;
  if (rule.inboxIds.includes(input.inboxId)) score += 100;

  return score;
}

function candidateMatches(candidate: AgentRoutingCandidate, input: RoutingInput) {
  if (!candidate.autoAssign) return false;
  if (candidate.availability !== "online") return false;
  if (candidate.openConversationCount >= candidate.maxOpenConversations) return false;

  const channelMatch =
    candidate.allowedChannels.length === 0 ||
    candidate.allowedChannels.includes(input.channel);
  const inboxMatch =
    candidate.allowedInboxIds.length === 0 ||
    candidate.allowedInboxIds.includes(input.inboxId);

  return channelMatch && inboxMatch;
}

function compareAssignmentTimestamp(a: string | null, b: string | null) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  return new Date(a).getTime() - new Date(b).getTime();
}
