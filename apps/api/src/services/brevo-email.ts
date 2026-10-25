export type BrevoEmailRequest = {
  sender: { name: string; email: string };
  to: Array<{ email: string }>;
  subject: string;
  textContent: string;
  htmlContent: string;
};

export class BrevoDeliveryError extends Error {
  constructor() { super("brevo-delivery-failed"); }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function safeHeader(value: string): string {
  return value.replace(/[\r\n]/g, " ").trim();
}

export async function sendBrevoEmail(
  request: BrevoEmailRequest,
  config: { apiKey: string; apiUrl: string; timeoutMs: number },
  fetcher: FetchLike = fetch,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetcher(config.apiUrl, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": config.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: safeHeader(request.sender.name),
          email: safeHeader(request.sender.email),
        },
        to: request.to.map((recipient) => ({ email: safeHeader(recipient.email) })),
        subject: safeHeader(request.subject),
        textContent: request.textContent,
        htmlContent: request.htmlContent,
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new BrevoDeliveryError();
  } catch (error) {
    if (error instanceof BrevoDeliveryError) throw error;
    throw new BrevoDeliveryError();
  } finally {
    clearTimeout(timer);
  }
}
