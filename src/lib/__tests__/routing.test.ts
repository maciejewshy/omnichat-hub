import { describe, expect, it } from "vitest";
import {
  pickAgentForAssignment,
  pickRoutingRule,
  shouldRedistributeOnAvailabilityChange,
} from "@/lib/routing";

describe("routing rules", () => {
  it("prefers inbox specific rule over generic channel rule", () => {
    const selected = pickRoutingRule(
      [
        {
          id: "rule-generic",
          teamId: "team-a",
          strategy: "round_robin",
          priority: 10,
          channelTypes: ["whatsapp"],
          inboxIds: [],
          isActive: true,
        },
        {
          id: "rule-specific",
          teamId: "team-b",
          strategy: "round_robin",
          priority: 50,
          channelTypes: ["whatsapp"],
          inboxIds: ["inbox-1"],
          isActive: true,
        },
      ],
      { channel: "whatsapp", inboxId: "inbox-1" },
    );

    expect(selected?.id).toBe("rule-specific");
  });

  it("picks least loaded eligible agent", () => {
    const selected = pickAgentForAssignment(
      [
        {
          userId: "agent-1",
          availability: "online",
          autoAssign: true,
          allowedChannels: [],
          allowedInboxIds: [],
          maxOpenConversations: 10,
          openConversationCount: 4,
          lastAssignedAt: "2026-06-23T10:00:00.000Z",
        },
        {
          userId: "agent-2",
          availability: "online",
          autoAssign: true,
          allowedChannels: ["whatsapp"],
          allowedInboxIds: [],
          maxOpenConversations: 10,
          openConversationCount: 1,
          lastAssignedAt: "2026-06-23T11:00:00.000Z",
        },
      ],
      { channel: "whatsapp", inboxId: "inbox-1" },
      "least_loaded",
    );

    expect(selected?.userId).toBe("agent-2");
  });

  it("skips offline or saturated agents in round robin", () => {
    const selected = pickAgentForAssignment(
      [
        {
          userId: "agent-1",
          availability: "offline",
          autoAssign: true,
          allowedChannels: [],
          allowedInboxIds: [],
          maxOpenConversations: 10,
          openConversationCount: 0,
          lastAssignedAt: null,
        },
        {
          userId: "agent-2",
          availability: "online",
          autoAssign: true,
          allowedChannels: [],
          allowedInboxIds: [],
          maxOpenConversations: 1,
          openConversationCount: 1,
          lastAssignedAt: null,
        },
        {
          userId: "agent-3",
          availability: "online",
          autoAssign: true,
          allowedChannels: [],
          allowedInboxIds: [],
          maxOpenConversations: 10,
          openConversationCount: 0,
          lastAssignedAt: "2026-06-23T12:00:00.000Z",
        },
      ],
      { channel: "telegram", inboxId: "inbox-2" },
      "round_robin",
    );

    expect(selected?.userId).toBe("agent-3");
  });

  it("can exclude current assignee during redistribution", () => {
    const selected = pickAgentForAssignment(
      [
        {
          userId: "agent-1",
          availability: "online",
          autoAssign: true,
          allowedChannels: [],
          allowedInboxIds: [],
          maxOpenConversations: 10,
          openConversationCount: 0,
          lastAssignedAt: "2026-06-23T10:00:00.000Z",
        },
        {
          userId: "agent-2",
          availability: "online",
          autoAssign: true,
          allowedChannels: [],
          allowedInboxIds: [],
          maxOpenConversations: 10,
          openConversationCount: 1,
          lastAssignedAt: "2026-06-23T09:00:00.000Z",
        },
      ],
      { channel: "whatsapp", inboxId: "inbox-1" },
      "round_robin",
      { excludeUserIds: ["agent-1"] },
    );

    expect(selected?.userId).toBe("agent-2");
  });

  it("redistributes only when agent transitions to offline", () => {
    expect(shouldRedistributeOnAvailabilityChange("online", "offline")).toBe(true);
    expect(shouldRedistributeOnAvailabilityChange("busy", "offline")).toBe(true);
    expect(shouldRedistributeOnAvailabilityChange("offline", "offline")).toBe(false);
    expect(shouldRedistributeOnAvailabilityChange("online", "busy")).toBe(false);
  });
});
