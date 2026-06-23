import { createFileRoute } from "@tanstack/react-router";
import {
  applyWebhookStatusUpdates,
  appendWebhookEventLog,
  getInboxConnectionByWebhook,
  ingestWebhookPayload,
} from "@/lib/inbox-connections.server";
import type { ChannelType } from "@/lib/inbox-connections";

export const Route = createFileRoute("/api/webhooks/$channel/$inboxId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const channel = params.channel as ChannelType;
        const tenantConnection = await getInboxConnectionByWebhook(params.inboxId, channel);
        if (!tenantConnection) {
          return text("Not found", 404);
        }

        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const verifyToken = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") ?? "";

        if (mode !== "subscribe") {
          return text("Unsupported", 400);
        }

        if (verifyToken !== tenantConnection.config.verify_token) {
          return text("Forbidden", 403);
        }

        return new Response(challenge, { status: 200 });
      },
      POST: async ({ request, params }) => {
        const channel = params.channel as ChannelType;
        const tenantConnection = await getInboxConnectionByWebhook(params.inboxId, channel);
        if (!tenantConnection) {
          return json({ error: "Inbox not found" }, 404);
        }

        if (channel === "telegram") {
          const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
          if (tenantConnection.config.webhook_secret && secretHeader !== tenantConnection.config.webhook_secret) {
            return json({ error: "Forbidden" }, 403);
          }
        }

        const payload = await parseJson(request);
        const statusUpdates = await applyWebhookStatusUpdates({
          inboxId: params.inboxId,
          channel,
          payload,
        });
        const ingestion = await ingestWebhookPayload({
          inboxId: params.inboxId,
          channel,
          payload,
        });

        if (ingestion.processed === 0 && statusUpdates.updated === 0) {
          await appendWebhookEventLog({
            inboxId: params.inboxId,
            channel,
            payload,
          });
        }

        return json({
          ok: true,
          processed: ingestion.processed,
          updated: statusUpdates.updated,
          summary: [ingestion.summary, statusUpdates.summary].filter(Boolean).join(" "),
        });
      },
    },
  },
});

async function parseJson(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return request.json();
  }

  const body = await request.text();
  try {
    return JSON.parse(body);
  } catch {
    return { raw: body };
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function text(payload: string, status = 200) {
  return new Response(payload, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
