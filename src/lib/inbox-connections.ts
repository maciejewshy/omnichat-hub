export type ChannelType = "whatsapp" | "instagram" | "facebook" | "telegram" | "webchat";

export type InboxConnectionStatus = "draft" | "configured";

export type InboxConnectionConfig = {
  provider: string;
  status: InboxConnectionStatus;
  api_version?: string;
  verify_token?: string;
  access_token?: string;
  app_id?: string;
  app_secret?: string;
  business_account_id?: string;
  phone_number_id?: string;
  instagram_business_account_id?: string;
  page_id?: string;
  page_access_token?: string;
  bot_token?: string;
  bot_username?: string;
  webhook_secret?: string;
  webhook_url?: string;
  widget_title?: string;
  welcome_message?: string;
  brand_color?: string;
  allowed_domains?: string;
  snippet?: string;
};

export type ConnectionField = {
  key: keyof InboxConnectionConfig;
  label: string;
  type?: "text" | "password" | "textarea" | "color";
  placeholder?: string;
  description?: string;
  readOnly?: boolean;
};

const secretFieldKeys: Array<keyof InboxConnectionConfig> = [
  "access_token",
  "app_secret",
  "page_access_token",
  "bot_token",
  "webhook_secret",
];

const providerByChannel: Record<ChannelType, string> = {
  whatsapp: "WhatsApp Cloud API",
  instagram: "Instagram Graph API",
  facebook: "Facebook Messenger Platform",
  telegram: "Telegram Bot API",
  webchat: "FlowChat Web Widget",
};

const requiredFieldsByChannel: Record<ChannelType, Array<keyof InboxConnectionConfig>> = {
  whatsapp: ["access_token", "business_account_id", "phone_number_id", "verify_token"],
  instagram: ["app_id", "app_secret", "instagram_business_account_id", "page_id", "access_token", "verify_token"],
  facebook: ["app_id", "app_secret", "page_id", "page_access_token", "verify_token"],
  telegram: ["bot_token", "bot_username", "webhook_secret"],
  webchat: ["widget_title", "welcome_message", "brand_color", "allowed_domains"],
};

const fieldDefinitions: Record<ChannelType, ConnectionField[]> = {
  whatsapp: [
    {
      key: "access_token",
      label: "Access token permanente",
      type: "password",
      placeholder: "EAAG...",
      description: "Token da Meta usado para enviar e receber mensagens pela Cloud API.",
    },
    {
      key: "business_account_id",
      label: "Business account ID",
      placeholder: "1029384756",
    },
    {
      key: "phone_number_id",
      label: "Phone number ID",
      placeholder: "554499887766",
    },
    {
      key: "verify_token",
      label: "Verify token do webhook",
      placeholder: "flowchat-whatsapp-token",
    },
    {
      key: "webhook_url",
      label: "Webhook oficial",
      readOnly: true,
      description: "Cadastre esta URL no app da Meta para receber eventos.",
    },
  ],
  instagram: [
    {
      key: "app_id",
      label: "Meta app ID",
      placeholder: "1234567890",
    },
    {
      key: "app_secret",
      label: "Meta app secret",
      type: "password",
      placeholder: "****************",
    },
    {
      key: "instagram_business_account_id",
      label: "Instagram business account ID",
      placeholder: "17841400000000000",
    },
    {
      key: "page_id",
      label: "Facebook page ID vinculada",
      placeholder: "9876543210",
    },
    {
      key: "access_token",
      label: "Access token da página",
      type: "password",
      placeholder: "EAAG...",
    },
    {
      key: "verify_token",
      label: "Verify token do webhook",
      placeholder: "flowchat-instagram-token",
    },
    {
      key: "webhook_url",
      label: "Webhook oficial",
      readOnly: true,
    },
  ],
  facebook: [
    {
      key: "app_id",
      label: "Meta app ID",
      placeholder: "1234567890",
    },
    {
      key: "app_secret",
      label: "Meta app secret",
      type: "password",
      placeholder: "****************",
    },
    {
      key: "page_id",
      label: "Facebook page ID",
      placeholder: "123456789012345",
    },
    {
      key: "page_access_token",
      label: "Page access token",
      type: "password",
      placeholder: "EAAG...",
    },
    {
      key: "verify_token",
      label: "Verify token do webhook",
      placeholder: "flowchat-facebook-token",
    },
    {
      key: "webhook_url",
      label: "Webhook oficial",
      readOnly: true,
    },
  ],
  telegram: [
    {
      key: "bot_token",
      label: "Token do bot",
      type: "password",
      placeholder: "123456:ABC-DEF...",
    },
    {
      key: "bot_username",
      label: "Username do bot",
      placeholder: "@flowchat_bot",
    },
    {
      key: "webhook_secret",
      label: "Secret do webhook",
      placeholder: "flowchat-telegram-secret",
    },
    {
      key: "webhook_url",
      label: "Webhook oficial",
      readOnly: true,
    },
  ],
  webchat: [
    {
      key: "widget_title",
      label: "Titulo do widget",
      placeholder: "Atendimento online",
    },
    {
      key: "welcome_message",
      label: "Mensagem inicial",
      type: "textarea",
      placeholder: "Oi! Como podemos ajudar?",
    },
    {
      key: "brand_color",
      label: "Cor principal",
      type: "color",
    },
    {
      key: "allowed_domains",
      label: "Dominios permitidos",
      type: "textarea",
      placeholder: "https://empresa.com\nhttps://app.empresa.com",
      description: "Um dominio por linha para limitar onde o widget pode ser embutido.",
    },
    {
      key: "snippet",
      label: "Snippet do widget",
      type: "textarea",
      readOnly: true,
      description: "Cole esse script antes de fechar o body do site.",
    },
  ],
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};

export const getProviderLabel = (channel: ChannelType) => providerByChannel[channel];

export const getConnectionFields = (channel: ChannelType) => fieldDefinitions[channel];

export const getOfficialWebhookUrl = (channel: ChannelType, inboxId: string) =>
  `https://api.flowchat.app/webhooks/${channel}/${inboxId}`;

export const getWebchatSnippet = (inboxId: string, brandColor: string) => {
  return [
    `<script`,
    `  src="https://cdn.flowchat.app/widget.js"`,
    `  data-inbox-id="${inboxId}"`,
    `  data-brand-color="${brandColor}"`,
    `  async`,
    `></script>`,
  ].join("\n");
};

export const createOfficialConnectionConfig = (
  channel: ChannelType,
  inboxId: string,
  currentConfig?: unknown,
): InboxConnectionConfig => {
  const current = toRecord(currentConfig);

  const baseConfig: InboxConnectionConfig = {
    provider: providerByChannel[channel],
    status: "draft",
    api_version: channel === "webchat" || channel === "telegram" ? undefined : "v23.0",
    verify_token: "",
    access_token: "",
    app_id: "",
    app_secret: "",
    business_account_id: "",
    phone_number_id: "",
    instagram_business_account_id: "",
    page_id: "",
    page_access_token: "",
    bot_token: "",
    bot_username: "",
    webhook_secret: "",
    webhook_url: getOfficialWebhookUrl(channel, inboxId),
    widget_title: "Atendimento FlowChat",
    welcome_message: "Oi! Como posso ajudar voce hoje?",
    brand_color: "#2563eb",
    allowed_domains: "https://seu-dominio.com",
    snippet: getWebchatSnippet(inboxId, "#2563eb"),
  };

  const merged = {
    ...baseConfig,
    ...current,
  } as InboxConnectionConfig;

  merged.provider = providerByChannel[channel];
  merged.webhook_url = getOfficialWebhookUrl(channel, inboxId);

  if (channel === "webchat") {
    merged.snippet = getWebchatSnippet(inboxId, merged.brand_color || "#2563eb");
  }

  merged.status = isOfficialConnectionConfigured(channel, merged) ? "configured" : "draft";

  return merged;
};

export const isOfficialConnectionConfigured = (
  channel: ChannelType,
  config: InboxConnectionConfig,
) => {
  return requiredFieldsByChannel[channel].every((key) => {
    const value = config[key];
    return typeof value === "string" && value.trim().length > 0;
  });
};

export const sanitizeConnectionConfig = (config: InboxConnectionConfig): InboxConnectionConfig => {
  const cloned = { ...config };

  secretFieldKeys.forEach((key) => {
    const value = cloned[key];
    if (typeof value === "string" && value.trim().length > 0) {
      cloned[key] = maskSecret(value) as never;
    }
  });

  return cloned;
};

export const mergeConnectionSecrets = (
  previous: InboxConnectionConfig,
  next: InboxConnectionConfig,
): InboxConnectionConfig => {
  const merged = { ...next };

  secretFieldKeys.forEach((key) => {
    const nextValue = merged[key];
    if (typeof nextValue === "string" && nextValue.includes("*")) {
      merged[key] = previous[key] as never;
    }
  });

  return merged;
};

export const getConnectionReadiness = (channel: ChannelType, config: InboxConnectionConfig) => {
  return requiredFieldsByChannel[channel].map((key) => ({
    key,
    label: key,
    ok: typeof config[key] === "string" && config[key]!.trim().length > 0,
  }));
};

function maskSecret(value: string) {
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}********${value.slice(-4)}`;
}
