import type { ChannelType } from "./inbox-connections";

export type NormalizedInboundMessage = {
  externalId?: string;
  contactIdentifier: string;
  contactName: string;
  phone?: string;
  email?: string;
  avatarUrl?: string;
  content: string;
  contentType: string;
  occurredAt?: string;
  attachments?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
};

export type NormalizedWebhookPayload = {
  events: NormalizedInboundMessage[];
  summary: string;
};

export type NormalizedStatusUpdate = {
  provider: ChannelType;
  providerMessageId?: string;
  delivery: "sent" | "delivered" | "read" | "failed";
  occurredAt?: string;
  error?: string;
  metadata?: Record<string, unknown>;
};

export function normalizeWebhookPayload(
  channel: ChannelType,
  payload: unknown,
): NormalizedWebhookPayload {
  switch (channel) {
    case "whatsapp":
      return normalizeWhatsAppPayload(payload);
    case "instagram":
      return normalizeMetaMessagingPayload("instagram", payload);
    case "facebook":
      return normalizeMetaMessagingPayload("facebook", payload);
    case "telegram":
      return normalizeTelegramPayload(payload);
    case "webchat":
      return normalizeWebchatPayload(payload);
  }
}

export function normalizeWebhookStatusUpdates(
  channel: ChannelType,
  payload: unknown,
): NormalizedStatusUpdate[] {
  switch (channel) {
    case "whatsapp":
      return normalizeWhatsAppStatusUpdates(payload);
    case "instagram":
      return normalizeMetaStatusUpdates("instagram", payload);
    case "facebook":
      return normalizeMetaStatusUpdates("facebook", payload);
    default:
      return [];
  }
}

function normalizeWhatsAppPayload(payload: unknown): NormalizedWebhookPayload {
  const events: NormalizedInboundMessage[] = [];

  for (const entry of asArray(getRecord(payload).entry)) {
    for (const change of asArray(getRecord(entry).changes)) {
      const value = getRecord(getRecord(change).value);
      const contacts = asArray(value.contacts).map((item) => getRecord(item));
      const contactsById = new Map(
        contacts.map((contact) => [asString(contact.wa_id) ?? "", contact]),
      );

      for (const message of asArray(value.messages)) {
        const msg = getRecord(message);
        const senderId = asString(msg.from);
        if (!senderId) continue;

        const senderContact = contactsById.get(senderId) ?? {};
        const profile = getRecord(senderContact.profile);
        const messageType = asString(msg.type) ?? "text";
        const content = extractWhatsAppContent(msg, messageType);
        if (!content) continue;

        const timestamp = asString(msg.timestamp);
        events.push({
          externalId: asString(msg.id),
          contactIdentifier: `whatsapp:${senderId}`,
          contactName: asString(profile.name) ?? senderId,
          phone: senderId,
          content,
          contentType: messageType,
          occurredAt: unixSecondsToIso(timestamp),
          attachments: collectWhatsAppAttachments(msg, messageType),
          metadata: {
            from: senderId,
            profile_name: asString(profile.name) ?? null,
          },
        });
      }
    }
  }

  return {
    events,
    summary: events.length > 0 ? `${events.length} mensagem(ns) do WhatsApp normalizadas.` : "Nenhuma mensagem do WhatsApp encontrada no payload.",
  };
}

function normalizeWhatsAppStatusUpdates(payload: unknown): NormalizedStatusUpdate[] {
  const updates: NormalizedStatusUpdate[] = [];

  for (const entry of asArray(getRecord(payload).entry)) {
    for (const change of asArray(getRecord(entry).changes)) {
      const value = getRecord(getRecord(change).value);
      for (const status of asArray(value.statuses)) {
        const item = getRecord(status);
        const id = asString(item.id);
        const delivery = normalizeDeliveryStatus(asString(item.status));

        if (!id || !delivery) continue;

        const errors = asArray(item.errors).map((error) => getRecord(error));
        const firstError = errors[0] ?? {};
        updates.push({
          provider: "whatsapp",
          providerMessageId: id,
          delivery,
          occurredAt: unixSecondsToIso(asString(item.timestamp)),
          error:
            asString(firstError.title) ??
            asString(firstError.message) ??
            asString(firstError.error_data),
          metadata: {
            recipient_id: asString(item.recipient_id) ?? null,
            conversation_id: asString(getRecord(item.conversation).id) ?? null,
            pricing_model: asString(getRecord(item.pricing).pricing_model) ?? null,
            billable: getRecord(item.pricing).billable ?? null,
          },
        });
      }
    }
  }

  return updates;
}

function normalizeMetaStatusUpdates(
  channel: "instagram" | "facebook",
  payload: unknown,
): NormalizedStatusUpdate[] {
  const updates: NormalizedStatusUpdate[] = [];

  for (const entry of asArray(getRecord(payload).entry)) {
    for (const event of asArray(getRecord(entry).messaging)) {
      const item = getRecord(event);
      const delivery = getRecord(item.delivery);
      const mids = asArray(delivery.mids);
      const watermark = unixMillisecondsToIso(asNumber(delivery.watermark) ?? asNumber(item.timestamp));

      for (const mid of mids) {
        const providerMessageId = asString(mid);
        if (!providerMessageId) continue;

        updates.push({
          provider: channel,
          providerMessageId,
          delivery: "delivered",
          occurredAt: watermark,
          metadata: {
            sender_id: asString(getRecord(item.sender).id) ?? null,
            recipient_id: asString(getRecord(item.recipient).id) ?? null,
          },
        });
      }
    }
  }

  return updates;
}

function normalizeMetaMessagingPayload(
  channel: "instagram" | "facebook",
  payload: unknown,
): NormalizedWebhookPayload {
  const events: NormalizedInboundMessage[] = [];

  for (const entry of asArray(getRecord(payload).entry)) {
    for (const event of asArray(getRecord(entry).messaging)) {
      const item = getRecord(event);
      const message = getRecord(item.message);
      const sender = getRecord(item.sender);
      const recipient = getRecord(item.recipient);
      const senderId = asString(sender.id);

      if (!senderId || isTruthy(message.is_echo) || senderId === asString(recipient.id)) {
        continue;
      }

      const text = asString(message.text);
      const attachments = asArray(message.attachments).map((attachment) => getRecord(attachment));
      const firstAttachment = attachments[0] ?? {};
      const attachmentType = asString(firstAttachment.type) ?? "attachment";
      const content = text ?? summarizeMetaAttachment(attachmentType);
      if (!content) continue;

      events.push({
        externalId: asString(message.mid),
        contactIdentifier: `${channel}:${senderId}`,
        contactName: `${channel === "instagram" ? "Instagram" : "Facebook"} ${senderId}`,
        content,
        contentType: text ? "text" : attachmentType,
        occurredAt: unixMillisecondsToIso(asNumber(item.timestamp)),
        attachments: attachments as Array<Record<string, unknown>>,
        metadata: {
          sender_id: senderId,
          recipient_id: asString(recipient.id) ?? null,
        },
      });
    }
  }

  return {
    events,
    summary: events.length > 0 ? `${events.length} mensagem(ns) ${channel} normalizadas.` : `Nenhuma mensagem ${channel} encontrada no payload.`,
  };
}

function normalizeTelegramPayload(payload: unknown): NormalizedWebhookPayload {
  const root = getRecord(payload);
  const message =
    getRecord(root.message).message_id !== undefined
      ? getRecord(root.message)
      : getRecord(root.edited_message).message_id !== undefined
        ? getRecord(root.edited_message)
        : null;

  if (!message) {
    return {
      events: [],
      summary: "Nenhuma mensagem do Telegram encontrada no payload.",
    };
  }

  const from = getRecord(message.from);
  const fromId = asNumber(from.id);
  if (fromId === null) {
    return {
      events: [],
      summary: "Payload do Telegram sem remetente utilizavel.",
    };
  }

  const firstName = asString(from.first_name) ?? "Telegram";
  const lastName = asString(from.last_name);
  const username = asString(from.username);
  const contentType = detectTelegramMessageType(message);
  const content = extractTelegramContent(message, contentType);

  if (!content) {
    return {
      events: [],
      summary: "Mensagem do Telegram sem conteudo suportado.",
    };
  }

  return {
    events: [
      {
        externalId: asNumber(message.message_id)?.toString(),
        contactIdentifier: `telegram:${fromId}`,
        contactName: [firstName, lastName].filter(Boolean).join(" ").trim(),
        content,
        contentType,
        occurredAt: unixSecondsToIso(asString(message.date)),
        attachments: collectTelegramAttachments(message, contentType),
        metadata: {
          telegram_username: username ?? null,
          chat_id: asNumber(getRecord(message.chat).id) ?? null,
        },
      },
    ],
    summary: "Mensagem do Telegram normalizada.",
  };
}

function normalizeWebchatPayload(payload: unknown): NormalizedWebhookPayload {
  const root = getRecord(payload);
  const events = asArray(root.events)
    .map((event) => normalizeSingleWebchatEvent(event))
    .filter(Boolean) as NormalizedInboundMessage[];

  if (events.length > 0) {
    return {
      events,
      summary: `${events.length} mensagem(ns) do webchat normalizadas.`,
    };
  }

  const singleEvent = normalizeSingleWebchatEvent(payload);
  return {
    events: singleEvent ? [singleEvent] : [],
    summary: singleEvent
      ? "Mensagem do webchat normalizada."
      : "Nenhuma mensagem do webchat encontrada no payload.",
  };
}

function normalizeSingleWebchatEvent(payload: unknown): NormalizedInboundMessage | null {
  const root = getRecord(payload);
  const contact = getRecord(root.contact);
  const message = getRecord(root.message);
  const identifier =
    asString(contact.identifier) ??
    asString(contact.email) ??
    asString(contact.phone) ??
    asString(root.identifier);
  const content =
    asString(message.content) ??
    asString(message.text) ??
    asString(root.content) ??
    asString(root.text);

  if (!identifier || !content) return null;

  return {
    externalId: asString(message.id) ?? asString(root.message_id),
    contactIdentifier: `webchat:${identifier}`,
    contactName: asString(contact.name) ?? "Visitante do site",
    phone: asString(contact.phone),
    email: asString(contact.email),
    content,
    contentType: asString(message.type) ?? "text",
    occurredAt: asString(root.occurred_at) ?? asString(message.created_at),
    attachments: asArray(message.attachments).map((item) => getRecord(item)) as Array<
      Record<string, unknown>
    >,
    metadata: {
      page_url: asString(root.page_url) ?? null,
      session_id: asString(root.session_id) ?? null,
    },
  };
}

function extractWhatsAppContent(message: Record<string, unknown>, type: string) {
  if (type === "text") {
    return asString(getRecord(message.text).body);
  }

  if (type === "button") {
    return asString(getRecord(message.button).text) ?? "[Botao selecionado]";
  }

  if (type === "interactive") {
    const interactive = getRecord(message.interactive);
    const buttonReply = getRecord(interactive.button_reply);
    const listReply = getRecord(interactive.list_reply);
    return (
      asString(buttonReply.title) ??
      asString(listReply.title) ??
      asString(listReply.description) ??
      "[Interacao recebida]"
    );
  }

  const mediaCaption =
    asString(getRecord(message.image).caption) ??
    asString(getRecord(message.video).caption) ??
    asString(getRecord(message.document).caption);

  return mediaCaption ?? summarizeMediaMessage(type);
}

function collectWhatsAppAttachments(message: Record<string, unknown>, type: string) {
  const media = getRecord(message[type]);
  const attachmentId = asString(media.id);
  if (!attachmentId) return [];

  return [
    {
      provider: "meta",
      type,
      id: attachmentId,
      mime_type: asString(media.mime_type) ?? null,
      filename: asString(media.filename) ?? null,
    },
  ];
}

function detectTelegramMessageType(message: Record<string, unknown>) {
  if (asString(message.text)) return "text";
  if (asString(message.caption) && asArray(message.photo).length > 0) return "photo";
  if (asString(message.caption) && getRecord(message.document).file_id !== undefined) return "document";
  if (asArray(message.photo).length > 0) return "photo";
  if (getRecord(message.document).file_id !== undefined) return "document";
  if (getRecord(message.voice).file_id !== undefined) return "voice";
  if (getRecord(message.video).file_id !== undefined) return "video";
  if (getRecord(message.sticker).file_id !== undefined) return "sticker";
  return "text";
}

function extractTelegramContent(message: Record<string, unknown>, type: string) {
  if (type === "text") return asString(message.text);
  if (type === "photo" || type === "document") {
    return asString(message.caption) ?? summarizeMediaMessage(type);
  }
  return summarizeMediaMessage(type);
}

function collectTelegramAttachments(message: Record<string, unknown>, type: string) {
  if (type === "photo") {
    const photoSizes = asArray(message.photo).map((item) => getRecord(item));
    const largest = photoSizes[photoSizes.length - 1];
    if (!largest) return [];
    return [
      {
        provider: "telegram",
        type: "photo",
        file_id: asString(largest.file_id) ?? null,
        width: asNumber(largest.width),
        height: asNumber(largest.height),
      },
    ];
  }

  const media = getRecord(message[type]);
  const fileId = asString(media.file_id);
  if (!fileId) return [];

  return [
    {
      provider: "telegram",
      type,
      file_id: fileId,
      mime_type: asString(media.mime_type) ?? null,
      file_name: asString(media.file_name) ?? null,
    },
  ];
}

function summarizeMetaAttachment(type: string) {
  return summarizeMediaMessage(type);
}

function summarizeMediaMessage(type: string) {
  switch (type) {
    case "image":
    case "photo":
      return "[Imagem recebida]";
    case "video":
      return "[Video recebido]";
    case "audio":
    case "voice":
      return "[Audio recebido]";
    case "document":
      return "[Documento recebido]";
    case "sticker":
      return "[Sticker recebido]";
    default:
      return "[Mensagem de midia recebida]";
  }
}

function normalizeDeliveryStatus(value: string | null) {
  switch (value) {
    case "sent":
    case "delivered":
    case "read":
    case "failed":
      return value;
    default:
      return null;
  }
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
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number"
    ? value
    : typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Number(value))
      ? Number(value)
      : null;
}

function isTruthy(value: unknown) {
  return value === true || value === "true" || value === 1;
}

function unixSecondsToIso(value: string | null) {
  const numeric = asNumber(value);
  if (numeric === null) return undefined;
  return new Date(numeric * 1000).toISOString();
}

function unixMillisecondsToIso(value: number | null) {
  if (value === null) return undefined;
  return new Date(value).toISOString();
}
