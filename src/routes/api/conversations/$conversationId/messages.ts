import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireApiUser } from "@/integrations/supabase/api-auth.server";
import { sendConversationMessageForTenant } from "@/lib/inbox-connections.server";

const sendMessageSchema = z.object({
  content: z.string().trim().min(1, "Mensagem obrigatoria"),
  isPrivate: z.boolean().default(false),
});

export const Route = createFileRoute("/api/conversations/$conversationId/messages")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const user = await requireApiUser(request);
        const body = await request.json();
        const parsed = sendMessageSchema.safeParse(body);

        if (!parsed.success) {
          return json({ error: "Invalid payload", issues: parsed.error.flatten() }, 400);
        }

        try {
          const result = await sendConversationMessageForTenant({
            conversationId: params.conversationId,
            tenantId: user.tenantId,
            userId: user.userId,
            content: parsed.data.content,
            isPrivate: parsed.data.isPrivate,
          });

          if (!result) {
            return json({ error: "Conversation not found" }, 404);
          }

          return json({ ok: true, delivery: result.delivery, providerMessageId: result.providerMessageId });
        } catch (error) {
          const status =
            error instanceof Error && "status" in error && typeof error.status === "number"
              ? error.status
              : 500;
          const message = error instanceof Error ? error.message : "Erro ao enviar mensagem";
          return json({ error: message }, status);
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
