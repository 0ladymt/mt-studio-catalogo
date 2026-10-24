import { describe, expect, it } from "vitest";
import { BrevoDeliveryError, sendBrevoEmail } from "../src/services/brevo-email.js";

const request = {
  sender: { name: "MT STUDIO", email: "contato@mtstudiocriativo.com.br" },
  to: [{ email: "cliente@example.invalid" }],
  subject: "Pagamento confirmado",
  textContent: "Pedido confirmado",
  htmlContent: "<p>Pedido confirmado</p>",
};

describe("Brevo HTTPS transport", () => {
  it("sends the expected JSON with api-key authentication", async () => {
    let captured: { input: string; init?: RequestInit } | undefined;
    await sendBrevoEmail(request, { apiKey: "brevo-test-key-1234567890", apiUrl: "https://api.brevo.com/v3/smtp/email", timeoutMs: 1000 }, async (input, init) => {
      captured = { input, init };
      return new Response(JSON.stringify({ messageId: "redacted" }), { status: 201 });
    });
    expect(captured?.input).toBe("https://api.brevo.com/v3/smtp/email");
    expect(captured?.init?.method).toBe("POST");
    expect((captured?.init?.headers as Record<string, string>)["api-key"]).toBe("brevo-test-key-1234567890");
    expect(JSON.parse(String(captured?.init?.body))).toMatchObject({ sender: request.sender, to: request.to });
  });

  it.each([400, 401, 429, 500, 503])("sanitizes HTTP %s responses", async (status) => {
    await expect(sendBrevoEmail(request, { apiKey: "brevo-test-key-1234567890", apiUrl: "https://api.brevo.com/v3/smtp/email", timeoutMs: 1000 }, async () => new Response("private provider detail", { status }))).rejects.toBeInstanceOf(BrevoDeliveryError);
  });

  it("sanitizes network and timeout failures", async () => {
    await expect(sendBrevoEmail(request, { apiKey: "brevo-test-key-1234567890", apiUrl: "https://api.brevo.com/v3/smtp/email", timeoutMs: 1000 }, async () => { throw new Error("private network detail"); })).rejects.toBeInstanceOf(BrevoDeliveryError);
  });
});
