import { describe, expect, it } from "vitest";
import {
  createOfficialConnectionConfig,
  mergeConnectionSecrets,
  sanitizeConnectionConfig,
} from "@/lib/inbox-connections";

describe("inbox official connections", () => {
  it("marks whatsapp as configured when required fields are present", () => {
    const config = createOfficialConnectionConfig("whatsapp", "inbox-1", {
      access_token: "EAAG1234567890TOKEN",
      business_account_id: "123456789",
      phone_number_id: "987654321",
      verify_token: "flowchat-token",
    });

    expect(config.status).toBe("configured");
    expect(config.webhook_url).toBe("https://api.flowchat.app/webhooks/whatsapp/inbox-1");
  });

  it("masks secrets when sanitizing config", () => {
    const config = createOfficialConnectionConfig("telegram", "inbox-2", {
      bot_token: "123456:ABCDEF123456",
      bot_username: "@flowchat_bot",
      webhook_secret: "secret-token-value",
    });

    const safeConfig = sanitizeConnectionConfig(config);

    expect(safeConfig.bot_token).toContain("****");
    expect(safeConfig.webhook_secret).toContain("****");
    expect(safeConfig.bot_username).toBe("@flowchat_bot");
  });

  it("keeps previous secrets when client sends masked values back", () => {
    const previous = createOfficialConnectionConfig("facebook", "inbox-3", {
      app_id: "123456789",
      app_secret: "app-secret-123456",
      page_id: "page-123",
      page_access_token: "page-access-token-xyz",
      verify_token: "verify-facebook",
    });

    const merged = mergeConnectionSecrets(previous, {
      ...previous,
      app_secret: "app********3456",
      page_access_token: "page********-xyz",
    });

    expect(merged.app_secret).toBe("app-secret-123456");
    expect(merged.page_access_token).toBe("page-access-token-xyz");
  });
});
