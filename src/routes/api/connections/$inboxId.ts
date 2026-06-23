import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireApiAdmin } from "@/integrations/supabase/api-auth.server";
import {
  getInboxConnectionForTenant,
  saveInboxConnectionForTenant,
} from "@/lib/inbox-connections.server";

const saveSchema = z.object({
  config: z.record(z.string(), z.unknown()),
});

export const Route = createFileRoute("/api/connections/$inboxId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await requireApiAdmin(request);
        const result = await getInboxConnectionForTenant(params.inboxId, user.tenantId);

        if (!result) {
          return json({ error: "Inbox not found" }, 404);
        }

        return json({
          inbox: {
            id: result.inbox.id,
            name: result.inbox.name,
            channel: result.inbox.channel_type,
          },
          config: result.safeConfig,
          readiness: result.readiness,
        });
      },
      POST: async ({ request, params }) => {
        const user = await requireApiAdmin(request);
        const body = await request.json();
        const parsed = saveSchema.safeParse(body);

        if (!parsed.success) {
          return json({ error: "Invalid payload", issues: parsed.error.flatten() }, 400);
        }

        const result = await saveInboxConnectionForTenant(
          params.inboxId,
          user.tenantId,
          parsed.data.config as never,
        );

        if (!result) {
          return json({ error: "Inbox not found" }, 404);
        }

        return json({
          ok: true,
          config: result.safeConfig,
          readiness: result.readiness,
        });
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
