import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createOfficialConnectionConfig,
  getConnectionReadiness,
  isOfficialConnectionConfigured,
  mergeConnectionSecrets,
  sanitizeConnectionConfig,
  type ChannelType,
  type InboxConnectionConfig,
} from "./inbox-connections";
import {
  normalizeWebhookPayload,
  normalizeWebhookStatusUpdates,
  type NormalizedInboundMessage,
  type NormalizedStatusUpdate,
} from "./webhook-ingestion";
import { autoAssignConversation, redistributeConversationForTenant } from "./routing.server";

type InboxRecord = {
  id: string;
  tenant_id: string;
  name: string;
  channel_type: ChannelType;
  config: unknown;
};

type ConnectionTestCheck = {
  label: string;
  ok: boolean;
  detail?: string;
};

type ConnectionProbeResult = {
  ok: boolean;
  message: string;
  checks: ConnectionTestCheck[];
  external: Record<string, string | number | boolean | null>;
};

type ConversationContactRecord = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  identifier: string | null;
};

type ConversationRecord = {
  id: string;
  tenant_id: string;
  inbox_id: string;
  contact_id: string;
  status: string;
  unread_count: number;
  inboxes: InboxRecord | null;
  contacts: ConversationContactRecord | null;
};

type SendMessageResult = {
  messageId: string;
  delivery: "local_only" | "telegram" | "whatsapp" | "instagram" | "facebook";
  providerMessageId?: string | null;
};

class OutboundMessageError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function getInboxForTenant(inboxId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("inboxes")
    .select("id, tenant_id, name, channel_type, config")
    .eq("id", inboxId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as InboxRecord;
}

export async function getInboxConnectionForTenant(inboxId: string, tenantId: string) {
  const inbox = await getInboxForTenant(inboxId, tenantId);
  if (!inbox) return null;

  const config = createOfficialConnectionConfig(inbox.channel_type, inbox.id, inbox.config);
  return {
    inbox,
    config,
    safeConfig: sanitizeConnectionConfig(config),
    readiness: getConnectionReadiness(inbox.channel_type, config),
  };
}

export async function getInboxConnectionByWebhook(inboxId: string, channel: ChannelType) {
  const { data, error } = await supabaseAdmin
    .from("inboxes")
    .select("id, tenant_id, name, channel_type, config")
    .eq("id", inboxId)
    .eq("channel_type", channel)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const inbox = data as InboxRecord;
  const config = createOfficialConnectionConfig(inbox.channel_type, inbox.id, inbox.config);

  return {
    inbox,
    config,
  };
}

export async function saveInboxConnectionForTenant(
  inboxId: string,
  tenantId: string,
  nextConfig: InboxConnectionConfig,
) {
  const current = await getInboxConnectionForTenant(inboxId, tenantId);
  if (!current) return null;

  const merged = mergeConnectionSecrets(current.config, nextConfig);
  const finalConfig = createOfficialConnectionConfig(
    current.inbox.channel_type,
    current.inbox.id,
    merged,
  );

  const { error } = await supabaseAdmin
    .from("inboxes")
    .update({ config: finalConfig })
    .eq("id", current.inbox.id)
    .eq("tenant_id", tenantId);

  if (error) throw error;

  return {
    inbox: current.inbox,
    config: finalConfig,
    safeConfig: sanitizeConnectionConfig(finalConfig),
    readiness: getConnectionReadiness(current.inbox.channel_type, finalConfig),
  };
}

export async function testInboxConnectionForTenant(inboxId: string, tenantId: string) {
  const current = await getInboxConnectionForTenant(inboxId, tenantId);
  if (!current) return null;

  const configured = isOfficialConnectionConfigured(current.inbox.channel_type, current.config);
  const probe = configured
    ? await runConnectionProbe(current.inbox.channel_type, current.config)
    : {
        ok: false,
        message: "Configuracao incompleta. Preencha os campos obrigatorios antes de ativar a conexao.",
        checks: [],
        external: {},
      };

  return {
    inboxId: current.inbox.id,
    channel: current.inbox.channel_type,
    provider: current.config.provider,
    status: current.config.status,
    readiness: current.readiness,
    connectionOk: probe.ok,
    message: probe.message,
    checks: probe.checks,
    external: probe.external,
  };
}

export async function appendWebhookEventLog(params: {
  inboxId: string;
  channel: ChannelType;
  payload: unknown;
}) {
  const { data: inbox, error: inboxError } = await supabaseAdmin
    .from("inboxes")
    .select("id, tenant_id, name")
    .eq("id", params.inboxId)
    .maybeSingle();

  if (inboxError || !inbox) {
    throw inboxError ?? new Error("Inbox not found");
  }

  const identifier = `${params.channel}-webhook`;
  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("tenant_id", inbox.tenant_id)
    .eq("identifier", identifier)
    .maybeSingle();

  let contactId = contact?.id;
  if (!contactId) {
    const { data: createdContact, error } = await supabaseAdmin
      .from("contacts")
      .insert({
        tenant_id: inbox.tenant_id,
        name: `${inbox.name} webhook`,
        identifier,
      })
      .select("id")
      .single();
    if (error) throw error;
    contactId = createdContact.id;
  }

  const { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("tenant_id", inbox.tenant_id)
    .eq("inbox_id", inbox.id)
    .eq("contact_id", contactId)
    .maybeSingle();

  let conversationId = conversation?.id;
  if (!conversationId) {
    const { data: createdConversation, error } = await supabaseAdmin
      .from("conversations")
      .insert({
        tenant_id: inbox.tenant_id,
        inbox_id: inbox.id,
        contact_id: contactId,
        status: "open",
      })
      .select("id")
      .single();
    if (error) throw error;
    conversationId = createdConversation.id;
  }

  const content = `Webhook ${params.channel} recebido:\n${JSON.stringify(params.payload, null, 2)}`;
  const { error: messageError } = await supabaseAdmin.from("messages").insert({
    tenant_id: inbox.tenant_id,
    conversation_id: conversationId,
    sender_type: "system",
    content,
    content_type: "webhook_event",
    is_private: true,
  });

  if (messageError) throw messageError;

  await supabaseAdmin
    .from("conversations")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", conversationId);
}

export async function ingestWebhookPayload(params: {
  inboxId: string;
  channel: ChannelType;
  payload: unknown;
}) {
  const inboxConnection = await getInboxConnectionByWebhook(params.inboxId, params.channel);
  if (!inboxConnection) {
    throw new Error("Inbox not found");
  }

  const normalized = normalizeWebhookPayload(params.channel, params.payload);
  if (normalized.events.length === 0) {
    return {
      processed: 0,
      summary: normalized.summary,
    };
  }

  let processed = 0;
  for (const event of normalized.events) {
    await persistInboundMessage({
      inbox: inboxConnection.inbox,
      event,
    });
    processed += 1;
  }

  return {
    processed,
    summary: normalized.summary,
  };
}

export async function applyWebhookStatusUpdates(params: {
  inboxId: string;
  channel: ChannelType;
  payload: unknown;
}) {
  const inboxConnection = await getInboxConnectionByWebhook(params.inboxId, params.channel);
  if (!inboxConnection) {
    throw new Error("Inbox not found");
  }

  const updates = normalizeWebhookStatusUpdates(params.channel, params.payload);
  if (updates.length === 0) {
    return {
      updated: 0,
      summary: `Nenhum status de ${params.channel} encontrado no payload.`,
    };
  }

  const { data: candidateMessages, error } = await supabaseAdmin
    .from("messages")
    .select("id, attachments, conversation_id, conversations!inner(inbox_id)")
    .eq("tenant_id", inboxConnection.inbox.tenant_id)
    .eq("sender_type", "agent")
    .eq("is_private", false)
    .eq("conversations.inbox_id", inboxConnection.inbox.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  const candidates =
    (candidateMessages as Array<{ id: string; attachments: unknown }> | null) ?? [];

  let updated = 0;
  for (const status of updates) {
    const matched = candidates.find((message) =>
      hasProviderMessageId(message.attachments, status.providerMessageId),
    );

    if (!matched) continue;

    const nextAttachments = updateDeliveryMetadata(matched.attachments, status);
    const { error: updateError } = await supabaseAdmin
      .from("messages")
      .update({ attachments: nextAttachments })
      .eq("id", matched.id);

    if (updateError) throw updateError;
    updated += 1;
  }

  return {
    updated,
    summary:
      updated > 0
        ? `${updated} mensagem(ns) atualizadas com status ${params.channel}.`
        : `Nenhuma mensagem correspondente para os status de ${params.channel}.`,
  };
}

export async function sendConversationMessageForTenant(params: {
  conversationId: string;
  tenantId: string;
  userId: string;
  content: string;
  isPrivate: boolean;
}) {
  const conversation = await getConversationForTenant(params.conversationId, params.tenantId);
  if (!conversation || !conversation.inboxes || !conversation.contacts) {
    return null;
  }

  const content = params.content.trim();
  if (!content) {
    throw new OutboundMessageError("Mensagem vazia.", 400);
  }

  let delivery: SendMessageResult["delivery"] = "local_only";
  let providerMessageId: string | null = null;
  let attachments: Array<Record<string, unknown>> = [];

  if (!params.isPrivate) {
    const officialConfig = createOfficialConnectionConfig(
      conversation.inboxes.channel_type,
      conversation.inboxes.id,
      conversation.inboxes.config,
    );

    if (conversation.inboxes.channel_type === "telegram") {
      providerMessageId = await sendTelegramTextMessage(officialConfig, conversation.contacts, content);
      delivery = "telegram";
      attachments = [{ provider: "telegram", provider_message_id: providerMessageId, delivery: "sent" }];
    } else if (conversation.inboxes.channel_type === "whatsapp") {
      providerMessageId = await sendWhatsAppTextMessage(officialConfig, conversation.contacts, content);
      delivery = "whatsapp";
      attachments = [{ provider: "whatsapp", provider_message_id: providerMessageId, delivery: "sent" }];
    } else if (conversation.inboxes.channel_type === "instagram") {
      providerMessageId = await sendMetaTextMessage("instagram", officialConfig, conversation.contacts, content);
      delivery = "instagram";
      attachments = [{ provider: "instagram", provider_message_id: providerMessageId, delivery: "sent" }];
    } else if (conversation.inboxes.channel_type === "facebook") {
      providerMessageId = await sendMetaTextMessage("facebook", officialConfig, conversation.contacts, content);
      delivery = "facebook";
      attachments = [{ provider: "facebook", provider_message_id: providerMessageId, delivery: "sent" }];
    }
  }

  const createdAt = new Date().toISOString();
  const { data: createdMessage, error: messageError } = await supabaseAdmin
    .from("messages")
    .insert({
      tenant_id: params.tenantId,
      conversation_id: conversation.id,
      sender_type: "agent",
      sender_id: params.userId,
      content,
      content_type: "text",
      is_private: params.isPrivate,
      attachments,
      created_at: createdAt,
    })
    .select("id")
    .single();

  if (messageError) throw messageError;

  const { error: conversationError } = await supabaseAdmin
    .from("conversations")
    .update({
      last_activity_at: createdAt,
      status: params.isPrivate ? conversation.status : "open",
    })
    .eq("id", conversation.id);

  if (conversationError) throw conversationError;

  return {
    messageId: createdMessage.id,
    delivery,
    providerMessageId,
  } satisfies SendMessageResult;
}

async function runConnectionProbe(
  channel: ChannelType,
  config: InboxConnectionConfig,
): Promise<ConnectionProbeResult> {
  switch (channel) {
    case "whatsapp":
      return runWhatsAppProbe(config);
    case "instagram":
      return runInstagramProbe(config);
    case "facebook":
      return runFacebookProbe(config);
    case "telegram":
      return runTelegramProbe(config);
    case "webchat":
      return runWebchatProbe(config);
  }
}

async function runWhatsAppProbe(config: InboxConnectionConfig): Promise<ConnectionProbeResult> {
  const phone = await fetchGraphResource({
    apiVersion: config.api_version,
    accessToken: config.access_token,
    resourceId: config.phone_number_id,
    fields: ["id", "display_phone_number", "verified_name", "quality_rating"],
  });

  if (!phone.ok) {
    return {
      ok: false,
      message: `Falha ao validar WhatsApp Cloud API: ${phone.message}`,
      checks: [{ label: "Meta Graph API", ok: false, detail: phone.message }],
      external: {},
    };
  }

  return {
    ok: true,
    message: `WhatsApp Cloud API validada para ${phone.data.display_phone_number ?? "o numero configurado"}.`,
    checks: [
      { label: "Token da Meta aceito", ok: true },
      {
        label: "Numero conectado",
        ok: true,
        detail: phone.data.display_phone_number ?? String(phone.data.id ?? config.phone_number_id ?? ""),
      },
    ],
    external: toExternalRecord({
      phone_number_id: phone.data.id ?? config.phone_number_id ?? null,
      display_phone_number: phone.data.display_phone_number ?? null,
      verified_name: phone.data.verified_name ?? null,
      quality_rating: phone.data.quality_rating ?? null,
    }),
  };
}

async function runInstagramProbe(config: InboxConnectionConfig): Promise<ConnectionProbeResult> {
  const account = await fetchGraphResource({
    apiVersion: config.api_version,
    accessToken: config.access_token,
    resourceId: config.instagram_business_account_id,
    fields: ["id", "username", "name"],
  });

  if (!account.ok) {
    return {
      ok: false,
      message: `Falha ao validar Instagram Graph API: ${account.message}`,
      checks: [{ label: "Instagram Business Account", ok: false, detail: account.message }],
      external: {},
    };
  }

  return {
    ok: true,
    message: `Instagram conectado com sucesso${account.data.username ? ` para @${account.data.username}` : ""}.`,
    checks: [
      { label: "Token da Meta aceito", ok: true },
      {
        label: "Conta comercial encontrada",
        ok: true,
        detail: account.data.username ? `@${account.data.username}` : String(account.data.id ?? ""),
      },
    ],
    external: toExternalRecord({
      instagram_business_account_id: account.data.id ?? config.instagram_business_account_id ?? null,
      username: account.data.username ?? null,
      name: account.data.name ?? null,
    }),
  };
}

async function runFacebookProbe(config: InboxConnectionConfig): Promise<ConnectionProbeResult> {
  const page = await fetchGraphResource({
    apiVersion: config.api_version,
    accessToken: config.page_access_token,
    resourceId: config.page_id,
    fields: ["id", "name"],
  });

  if (!page.ok) {
    return {
      ok: false,
      message: `Falha ao validar Facebook Messenger: ${page.message}`,
      checks: [{ label: "Pagina conectada", ok: false, detail: page.message }],
      external: {},
    };
  }

  return {
    ok: true,
    message: `Facebook Messenger validado para a pagina ${page.data.name ?? "configurada"}.`,
    checks: [
      { label: "Page access token aceito", ok: true },
      {
        label: "Pagina encontrada",
        ok: true,
        detail: page.data.name ?? String(page.data.id ?? config.page_id ?? ""),
      },
    ],
    external: toExternalRecord({
      page_id: page.data.id ?? config.page_id ?? null,
      page_name: page.data.name ?? null,
    }),
  };
}

async function runTelegramProbe(config: InboxConnectionConfig): Promise<ConnectionProbeResult> {
  const response = await executeJsonRequest(
    `https://api.telegram.org/bot${config.bot_token}/getMe`,
  );

  if (!response.ok) {
    return {
      ok: false,
      message: `Falha ao validar Telegram Bot API: ${response.message}`,
      checks: [{ label: "Token do bot", ok: false, detail: response.message }],
      external: {},
    };
  }

  const bot = response.data.result ?? {};
  return {
    ok: true,
    message: `Telegram validado para o bot ${bot.username ? `@${bot.username}` : "configurado"}.`,
    checks: [
      { label: "Token do bot aceito", ok: true },
      {
        label: "Bot encontrado",
        ok: true,
        detail: bot.username ? `@${bot.username}` : String(bot.id ?? config.bot_username ?? ""),
      },
    ],
    external: toExternalRecord({
      bot_id: bot.id ?? null,
      username: bot.username ?? null,
      first_name: bot.first_name ?? null,
      can_join_groups: bot.can_join_groups ?? null,
    }),
  };
}

async function runWebchatProbe(config: InboxConnectionConfig): Promise<ConnectionProbeResult> {
  const allowedDomains = String(config.allowed_domains ?? "")
    .split(/\r?\n/)
    .map((domain) => domain.trim())
    .filter(Boolean);

  return {
    ok: allowedDomains.length > 0 && Boolean(config.snippet),
    message:
      allowedDomains.length > 0
        ? `Widget pronto para publicacao em ${allowedDomains.length} dominio(s).`
        : "Defina ao menos um dominio permitido antes de publicar o widget.",
    checks: [
      {
        label: "Dominios permitidos",
        ok: allowedDomains.length > 0,
        detail: allowedDomains.length > 0 ? allowedDomains.join(", ") : "Nenhum dominio definido",
      },
      {
        label: "Snippet gerado",
        ok: Boolean(config.snippet),
      },
    ],
    external: toExternalRecord({
      allowed_domains_count: allowedDomains.length,
      widget_title: config.widget_title ?? null,
    }),
  };
}

async function fetchGraphResource(params: {
  apiVersion?: string;
  accessToken?: string;
  resourceId?: string;
  fields: string[];
}) {
  const apiVersion = params.apiVersion || "v23.0";
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${params.resourceId}`);
  url.searchParams.set("fields", params.fields.join(","));

  return executeJsonRequest(url.toString(), {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  });
}

async function executeJsonRequest(url: string, init?: RequestInit) {
  try {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false as const,
        message: extractRequestError(payload) ?? `HTTP ${response.status}`,
      };
    }

    return {
      ok: true as const,
      data: payload as Record<string, unknown>,
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "Falha de rede",
    };
  }
}

function extractRequestError(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;

  const directMessage =
    "message" in payload && typeof payload.message === "string" ? payload.message : null;
  if (directMessage) return directMessage;

  const nestedError =
    "error" in payload && payload.error && typeof payload.error === "object"
      ? payload.error
      : null;

  if (nestedError && "message" in nestedError && typeof nestedError.message === "string") {
    return nestedError.message;
  }

  if (nestedError && "description" in nestedError && typeof nestedError.description === "string") {
    return nestedError.description;
  }

  return null;
}

function toExternalRecord(
  data: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(data)
      .map(([key, value]) => [key, normalizeExternalValue(value)])
      .filter(([, value]) => value !== undefined),
  ) as Record<string, string | number | boolean | null>;
}

function normalizeExternalValue(value: unknown) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return undefined;
}

function hasProviderMessageId(attachments: unknown, providerMessageId: string) {
  return asAttachmentArray(attachments).some(
    (attachment) => asString(attachment.provider_message_id) === providerMessageId,
  );
}

function updateDeliveryMetadata(attachments: unknown, status: NormalizedStatusUpdate) {
  const current = asAttachmentArray(attachments);
  if (current.length === 0) {
    return [
      {
        provider: status.provider,
        provider_message_id: status.providerMessageId,
        delivery: status.delivery,
        delivered_at: status.occurredAt ?? null,
        error: status.error ?? null,
        ...(status.metadata ?? {}),
      },
    ];
  }

  return current.map((attachment) => {
    if (asString(attachment.provider_message_id) !== status.providerMessageId) {
      return attachment;
    }

    return {
      ...attachment,
      delivery: status.delivery,
      delivered_at: status.occurredAt ?? attachment.delivered_at ?? null,
      error: status.error ?? null,
      ...(status.metadata ?? {}),
    };
  });
}

function asAttachmentArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

async function getConversationForTenant(conversationId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .select(
      "id, tenant_id, inbox_id, contact_id, status, unread_count, inboxes(id, tenant_id, name, channel_type, config), contacts(id, name, phone, email, identifier)",
    )
    .eq("id", conversationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return data as unknown as ConversationRecord;
}

async function sendTelegramTextMessage(
  config: InboxConnectionConfig,
  contact: ConversationContactRecord,
  content: string,
) {
  if (!config.bot_token) {
    throw new OutboundMessageError("Configure o bot do Telegram antes de enviar mensagens.", 400);
  }

  const chatId = getTelegramChatId(contact);
  if (!chatId) {
    throw new OutboundMessageError("Contato sem identificador de chat do Telegram.", 400);
  }

  const response = await executeJsonRequest(
    `https://api.telegram.org/bot${config.bot_token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: content,
      }),
    },
  );

  if (!response.ok) {
    throw new OutboundMessageError(
      `Falha ao enviar mensagem no Telegram: ${response.message}`,
      502,
    );
  }

  const result = getRecord(response.data).result;
  return asString(getRecord(result).message_id) ?? String(asNumber(getRecord(result).message_id) ?? "");
}

async function sendWhatsAppTextMessage(
  config: InboxConnectionConfig,
  contact: ConversationContactRecord,
  content: string,
) {
  if (!config.access_token || !config.phone_number_id) {
    throw new OutboundMessageError(
      "Configure access token e phone number id do WhatsApp antes de enviar mensagens.",
      400,
    );
  }

  const destination = getWhatsAppDestination(contact);
  if (!destination) {
    throw new OutboundMessageError("Contato sem telefone valido para WhatsApp.", 400);
  }

  const apiVersion = config.api_version || "v23.0";
  const response = await executeJsonRequest(
    `https://graph.facebook.com/${apiVersion}/${config.phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: destination,
        type: "text",
        text: {
          preview_url: false,
          body: content,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new OutboundMessageError(
      `Falha ao enviar mensagem no WhatsApp: ${response.message}`,
      502,
    );
  }

  const messages = asArray(getRecord(response.data).messages).map((item) => getRecord(item));
  const firstMessage = messages[0] ?? {};
  return asString(firstMessage.id) ?? null;
}

async function sendMetaTextMessage(
  channel: "instagram" | "facebook",
  config: InboxConnectionConfig,
  contact: ConversationContactRecord,
  content: string,
) {
  const accessToken = getMetaAccessToken(channel, config);
  if (!accessToken) {
    throw new OutboundMessageError(
      `Configure o token oficial do ${channel === "instagram" ? "Instagram" : "Facebook"} antes de enviar mensagens.`,
      400,
    );
  }

  const recipientId = getMetaRecipientId(channel, contact);
  if (!recipientId) {
    throw new OutboundMessageError(
      `Contato sem identificador valido de ${channel === "instagram" ? "Instagram" : "Facebook"}.`,
      400,
    );
  }

  const apiVersion = config.api_version || "v23.0";
  const response = await executeJsonRequest(
    `https://graph.facebook.com/${apiVersion}/me/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: { text: content },
      }),
    },
  );

  if (!response.ok) {
    throw new OutboundMessageError(
      `Falha ao enviar mensagem no ${channel === "instagram" ? "Instagram" : "Facebook"}: ${response.message}`,
      502,
    );
  }

  return asString(getRecord(response.data).message_id) ?? null;
}

function getMetaAccessToken(channel: "instagram" | "facebook", config: InboxConnectionConfig) {
  if (channel === "instagram") {
    return config.access_token ?? config.page_access_token ?? null;
  }

  return config.page_access_token ?? config.access_token ?? null;
}

function getMetaRecipientId(channel: "instagram" | "facebook", contact: ConversationContactRecord) {
  const identifier = contact.identifier ?? "";
  const prefix = `${channel}:`;

  if (identifier.startsWith(prefix)) {
    return identifier.replace(prefix, "").trim() || null;
  }

  return null;
}

function getTelegramChatId(contact: ConversationContactRecord) {
  const identifier = contact.identifier ?? "";
  if (identifier.startsWith("telegram:")) {
    return identifier.replace("telegram:", "").trim();
  }

  return null;
}

function getWhatsAppDestination(contact: ConversationContactRecord) {
  const identifier = contact.identifier ?? "";
  const raw =
    identifier.startsWith("whatsapp:")
      ? identifier.replace("whatsapp:", "").trim()
      : (contact.phone ?? "").trim();

  const digits = raw.replace(/\D/g, "");
  return digits.length > 7 ? digits : null;
}

function getRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  if (typeof value === "string") {
    return value.trim().length > 0 ? value : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function asNumber(value: unknown) {
  return typeof value === "number"
    ? value
    : typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Number(value))
      ? Number(value)
      : null;
}

async function persistInboundMessage(params: {
  inbox: InboxRecord;
  event: NormalizedInboundMessage;
}) {
  const contactId = await findOrCreateInboundContact(params.inbox.tenant_id, params.event);
  const conversation = await findOrCreateInboundConversation({
    tenantId: params.inbox.tenant_id,
    inboxId: params.inbox.id,
    contactId,
    occurredAt: params.event.occurredAt,
  });

  if (!conversation.assignee_id) {
    const assignment = await autoAssignConversation({
      conversationId: conversation.id,
      tenantId: params.inbox.tenant_id,
      inboxId: params.inbox.id,
      channel: params.inbox.channel_type,
      currentTeamId: conversation.team_id,
      currentAssigneeId: conversation.assignee_id,
    });
    conversation.team_id = assignment.teamId;
    conversation.assignee_id = assignment.assigneeId;
  } else {
    const redistribution = await redistributeConversationForTenant({
      conversationId: conversation.id,
      tenantId: params.inbox.tenant_id,
      force: false,
    });
    if (redistribution?.changed) {
      conversation.team_id = redistribution.teamId;
      conversation.assignee_id = redistribution.assigneeId;
    }
  }

  const { error: messageError } = await supabaseAdmin.from("messages").insert({
    tenant_id: params.inbox.tenant_id,
    conversation_id: conversation.id,
    sender_type: "contact",
    content: params.event.content,
    content_type: params.event.contentType || "text",
    attachments: params.event.attachments ?? [],
    created_at: params.event.occurredAt ?? new Date().toISOString(),
  });

  if (messageError) throw messageError;

  const unreadCount = (conversation.unread_count ?? 0) + 1;
  const { error: conversationError } = await supabaseAdmin
    .from("conversations")
    .update({
      status: "open",
      unread_count: unreadCount,
      last_activity_at: params.event.occurredAt ?? new Date().toISOString(),
    })
    .eq("id", conversation.id);

  if (conversationError) throw conversationError;
}

async function findOrCreateInboundContact(
  tenantId: string,
  event: NormalizedInboundMessage,
) {
  const { data: existing, error } = await supabaseAdmin
    .from("contacts")
    .select("id, name, phone, email, avatar_url, custom_attributes")
    .eq("tenant_id", tenantId)
    .eq("identifier", event.contactIdentifier)
    .maybeSingle();

  if (error) throw error;

  const customAttributes = {
    source: "official_webhook",
    ...(existing?.custom_attributes && typeof existing.custom_attributes === "object"
      ? (existing.custom_attributes as Record<string, unknown>)
      : {}),
    ...(event.metadata ?? {}),
  };

  if (existing) {
    const nextValues = {
      name: existing.name || event.contactName,
      phone: existing.phone || event.phone || null,
      email: existing.email || event.email || null,
      avatar_url: existing.avatar_url || event.avatarUrl || null,
      custom_attributes: customAttributes,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabaseAdmin
      .from("contacts")
      .update(nextValues)
      .eq("id", existing.id);

    if (updateError) throw updateError;
    return existing.id;
  }

  const { data: created, error: insertError } = await supabaseAdmin
    .from("contacts")
    .insert({
      tenant_id: tenantId,
      name: event.contactName,
      phone: event.phone ?? null,
      email: event.email ?? null,
      avatar_url: event.avatarUrl ?? null,
      identifier: event.contactIdentifier,
      custom_attributes: customAttributes,
    })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return created.id;
}

async function findOrCreateInboundConversation(params: {
  tenantId: string;
  inboxId: string;
  contactId: string;
  occurredAt?: string;
}) {
  const { data: existing, error } = await supabaseAdmin
    .from("conversations")
    .select("id, status, unread_count, assignee_id, team_id")
    .eq("tenant_id", params.tenantId)
    .eq("inbox_id", params.inboxId)
    .eq("contact_id", params.contactId)
    .neq("status", "resolved")
    .order("last_activity_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (existing) return existing;

  const { data: created, error: insertError } = await supabaseAdmin
    .from("conversations")
    .insert({
      tenant_id: params.tenantId,
      inbox_id: params.inboxId,
      contact_id: params.contactId,
      status: "open",
      unread_count: 0,
      last_activity_at: params.occurredAt ?? new Date().toISOString(),
    })
    .select("id, status, unread_count, assignee_id, team_id")
    .single();

  if (insertError) throw insertError;
  return created;
}
