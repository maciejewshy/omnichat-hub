import { describe, expect, it } from "vitest";
import { normalizeWebhookPayload, normalizeWebhookStatusUpdates } from "@/lib/webhook-ingestion";

describe("webhook ingestion normalizers", () => {
  it("normalizes whatsapp text messages", () => {
    const result = normalizeWebhookPayload("whatsapp", {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [
                  {
                    wa_id: "5511999990000",
                    profile: { name: "Maria Silva" },
                  },
                ],
                messages: [
                  {
                    id: "wamid-1",
                    from: "5511999990000",
                    timestamp: "1719168000",
                    type: "text",
                    text: { body: "Ola, preciso de ajuda" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      externalId: "wamid-1",
      contactIdentifier: "whatsapp:5511999990000",
      contactName: "Maria Silva",
      phone: "5511999990000",
      content: "Ola, preciso de ajuda",
      contentType: "text",
    });
  });

  it("normalizes telegram text messages", () => {
    const result = normalizeWebhookPayload("telegram", {
      update_id: 1,
      message: {
        message_id: 99,
        date: 1719168000,
        text: "Quero saber o status do pedido",
        from: {
          id: 123456,
          first_name: "Joao",
          last_name: "Silva",
          username: "joaosilva",
        },
        chat: { id: 123456, type: "private" },
      },
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      externalId: "99",
      contactIdentifier: "telegram:123456",
      contactName: "Joao Silva",
      content: "Quero saber o status do pedido",
      contentType: "text",
    });
  });

  it("normalizes facebook messenger attachments with fallback text", () => {
    const result = normalizeWebhookPayload("facebook", {
      entry: [
        {
          messaging: [
            {
              sender: { id: "user-1" },
              recipient: { id: "page-1" },
              timestamp: 1719168000000,
              message: {
                mid: "mid-1",
                attachments: [{ type: "image", payload: { url: "https://example.com/image.jpg" } }],
              },
            },
          ],
        },
      ],
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      externalId: "mid-1",
      contactIdentifier: "facebook:user-1",
      content: "[Imagem recebida]",
      contentType: "image",
    });
    expect(result.events[0].attachments).toHaveLength(1);
  });

  it("normalizes simple webchat payloads", () => {
    const result = normalizeWebhookPayload("webchat", {
      contact: {
        name: "Visitante",
        email: "visitante@example.com",
      },
      message: {
        id: "msg-1",
        content: "Preciso falar com o suporte",
      },
      page_url: "https://empresa.com/contato",
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      externalId: "msg-1",
      contactIdentifier: "webchat:visitante@example.com",
      contactName: "Visitante",
      email: "visitante@example.com",
      content: "Preciso falar com o suporte",
    });
  });

  it("normalizes whatsapp delivery status updates", () => {
    const updates = normalizeWebhookStatusUpdates("whatsapp", {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: "wamid.HBgLMTIzNDU2Nzg5",
                    status: "read",
                    timestamp: "1719168000",
                    recipient_id: "5511999990000",
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      provider: "whatsapp",
      providerMessageId: "wamid.HBgLMTIzNDU2Nzg5",
      delivery: "read",
    });
  });

  it("normalizes facebook delivery receipts", () => {
    const updates = normalizeWebhookStatusUpdates("facebook", {
      entry: [
        {
          messaging: [
            {
              sender: { id: "user-1" },
              recipient: { id: "page-1" },
              delivery: {
                mids: ["mid.123"],
                watermark: 1719168000000,
              },
            },
          ],
        },
      ],
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      provider: "facebook",
      providerMessageId: "mid.123",
      delivery: "delivered",
    });
  });
});
