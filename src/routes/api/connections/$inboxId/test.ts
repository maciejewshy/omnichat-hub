import { createFileRoute } from "@tanstack/react-router";
import { requireApiAdmin } from "@/integrations/supabase/api-auth.server";
import { testInboxConnectionForTenant } from "@/lib/inbox-connections.server";

export const Route = createFileRoute("/api/connections/$inboxId/test")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const user = await requireApiAdmin(request);
        const result = await testInboxConnectionForTenant(params.inboxId, user.tenantId);

        if (!result) {
          return json({ error: "Inbox not found" }, 404);
        }

        return json(result);
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
