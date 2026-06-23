import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser } from "@/integrations/supabase/api-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { redistributeConversationForTenant } from "@/lib/routing.server";

export const Route = createFileRoute("/api/conversations/$conversationId/redistribute")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const user = await requireApiUser(request);
        const { data: conversation, error } = await supabaseAdmin
          .from("conversations")
          .select("id, assignee_id")
          .eq("id", params.conversationId)
          .eq("tenant_id", user.tenantId)
          .maybeSingle();

        if (error) {
          return json({ error: error.message }, 500);
        }

        if (!conversation) {
          return json({ error: "Conversation not found" }, 404);
        }

        const canManage =
          user.roles.includes("admin") ||
          user.roles.includes("superadmin") ||
          user.roles.includes("gerente");

        if (!canManage && conversation.assignee_id && conversation.assignee_id !== user.userId) {
          return json({ error: "Forbidden" }, 403);
        }

        try {
          const result = await redistributeConversationForTenant({
            conversationId: params.conversationId,
            tenantId: user.tenantId,
            force: true,
          });

          if (!result) {
            return json({ error: "Conversation not found" }, 404);
          }

          return json({
            ok: true,
            changed: result.changed,
            teamId: result.teamId,
            assigneeId: result.assigneeId,
            ruleId: result.ruleId,
          });
        } catch (redistributionError) {
          const message =
            redistributionError instanceof Error
              ? redistributionError.message
              : "Erro ao redistribuir conversa";
          return json({ error: message }, 500);
        }
      },
    },
  },
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}
