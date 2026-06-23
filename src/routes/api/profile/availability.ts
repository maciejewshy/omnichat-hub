import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireApiUser } from "@/integrations/supabase/api-auth.server";
import { updateAgentAvailabilityForTenant } from "@/lib/routing.server";

const updateAvailabilitySchema = z.object({
  availability: z.enum(["online", "busy", "offline"]),
});

export const Route = createFileRoute("/api/profile/availability")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await requireApiUser(request);
        const body = await request.json();
        const parsed = updateAvailabilitySchema.safeParse(body);

        if (!parsed.success) {
          return json({ error: "Invalid payload", issues: parsed.error.flatten() }, 400);
        }

        try {
          const result = await updateAgentAvailabilityForTenant({
            tenantId: user.tenantId,
            userId: user.userId,
            availability: parsed.data.availability,
          });

          if (!result) {
            return json({ error: "Profile not found" }, 404);
          }

          return json({
            ok: true,
            availability: result.availability,
            previousAvailability: result.previousAvailability,
            changed: result.changed,
            touchedConversationCount: result.touchedConversationCount,
            reassignedCount: result.reassignedCount,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Erro ao atualizar disponibilidade";
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
